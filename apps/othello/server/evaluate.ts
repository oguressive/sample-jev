import { TypeSafeClient, noul, score, type Questions } from "@typesafe-ai/sdk";
import {
  batchSize,
  choose,
  composite,
  difficultyProfile,
  formulaVersion,
  questionVersion,
  upstreamTimeoutMs,
  warmupTimeoutMs,
  type Analysis,
  type Evaluation,
} from "../src/core/evaluation.ts";
import { difficulties, type Difficulty } from "../src/core/game.ts";
import {
  coordinate,
  counts,
  finished,
  legalMoves,
  opposite,
  parsePosition,
  play,
  positionKey,
  winner,
  type Position,
} from "../src/core/rules.ts";

export type EvaluationRequest = {
  position: Position;
  revision: number;
  difficulty: Difficulty;
  mode: "move" | "hint" | "review";
};
export function parseRequest(input: unknown): EvaluationRequest {
  const r = input as EvaluationRequest;
  if (
    !r ||
    !difficulties.includes(r.difficulty) ||
    !["move", "hint", "review"].includes(r.mode) ||
    !Number.isSafeInteger(r.revision) ||
    r.revision < 0
  )
    throw new Error("Invalid request");
  const position = parsePosition(r.position);
  if (!legalMoves(position).length) throw new Error("No legal move");
  return {
    position,
    revision: r.revision,
    difficulty: r.difficulty,
    mode: r.mode,
  };
}
const rubric = [
  "Very poor for the acting player",
  "Below average",
  "Balanced",
  "Good",
  "Excellent for the acting player",
] as const;
export type Evaluator = (
  request: EvaluationRequest,
  signal: AbortSignal,
) => Promise<Analysis>;
export function makeEvaluator(
  client: Pick<TypeSafeClient, "systemOne">,
): Evaluator {
  return async (request, signal) => {
    const started = performance.now(),
      { position, revision, mode, difficulty } = request;
    const candidates = legalMoves(position),
      evaluations: Evaluation[] = [];
    let calls = 0,
      tokens = 0,
      model = "deterministic-terminal";
    const profile = difficultyProfile(mode === "move" ? difficulty : "Goat");
    // At most eight candidates per API call, sequentially; no hidden automatic retries.
    for (let offset = 0; offset < candidates.length; offset += batchSize) {
      signal.throwIfAborted();
      const batch = candidates.slice(offset, offset + batchSize),
        questions: Questions = {};
      const stateCandidates = [];
      for (const square of batch) {
        const after = play(position, square);
        if (finished(after)) {
          const result = winner(after),
            p = result === position.turn ? 1 : 0;
          evaluations.push({
            square,
            p,
            m: 0.5,
            t: 0.5,
            score: result === 0 ? 50 : p === 1 ? 100 : 1,
            terminal: true,
          });
          continue;
        }
        const label = coordinate(square);
        questions[`${square}_p`] = noul(
          `If the acting player chooses ${label}, will that player eventually WIN (not draw) under strong continuation by both sides? Estimate win likelihood; consider stable corners, parity, frontier, mobility and forced passes. Do not confuse current disk count with advantage.`,
        );
        questions[`${square}_m`] = score(
          `For candidate ${label}, assess the acting player's future legal-move flexibility over the next several turns relative to the opponent. This is future mobility quality, NOT immediate flips or a literal move count.`,
          rubric,
        );
        questions[`${square}_t`] = score(
          `For candidate ${label}, assess the acting player's future tempo advantage: gaining extra turns by forcing opponent passes while avoiding own passes, and useful endgame parity. NOT total disks.`,
          rubric,
        );
        const replies = legalMoves(after),
          opponent = opposite(position.turn);
        stateCandidates.push({
          square: label,
          boardAfter: positionKey(after),
          legalReplies: replies.map(coordinate),
          opponentMustPass: !replies.length,
          // Mobility = moves a side could make on this board if it were that side's turn.
          actingPlayerMobility: legalMoves(after, position.turn).length,
          opponentMobility: replies.length,
          ...(profile.replies
            ? {
                replyFacts: replies.map((s) => {
                  const next = play(after, s),
                    actingMoves = legalMoves(next, position.turn).length;
                  return {
                    reply: coordinate(s),
                    actingPlayerMobility: actingMoves,
                    opponentMobility: legalMoves(next, opponent).length,
                    actingPlayerMustPass: !actingMoves,
                    disks: counts(next),
                  };
                }),
              }
            : {}),
        });
      }
      if (!Object.keys(questions).length) continue;
      const response = await client.systemOne(
        {
          state: {
            game: "Standard 8x8 Othello. B=black W=white .=empty. Coordinates A1-H8 row-major. If no legal move, pass; if neither can move, most disks wins.",
            actingPlayer: position.turn === 1 ? "B" : "W",
            position: positionKey(position),
            candidates: stateCandidates,
          },
          questions,
        },
        { signal, timeout: upstreamTimeoutMs, retry: { maxRetries: 0 } },
      );
      calls++;
      model = response.model;
      tokens += response.usage.input_tokens + response.usage.output_tokens;
      for (const square of batch) {
        if (evaluations.some((e) => e.square === square)) continue;
        const pAnswer = response.answers[`${square}_p`],
          mAnswer = response.answers[`${square}_m`],
          tAnswer = response.answers[`${square}_t`];
        if (
          pAnswer?.type !== "noul" ||
          mAnswer?.type !== "score" ||
          tAnswer?.type !== "score"
        )
          throw new Error("Invalid Jev response");
        const p = pAnswer.noul,
          m = mAnswer.score / 4,
          t = tAnswer.score / 4;
        if (![p, m, t].every((v) => Number.isFinite(v) && v >= 0 && v <= 1))
          throw new Error("Invalid Jev value");
        evaluations.push({
          square,
          p,
          m,
          t,
          score: composite(position, p, m, t),
          terminal: false,
        });
      }
    }
    evaluations.sort((a, b) => a.square - b.square);
    return {
      key: positionKey(position),
      revision,
      evaluations,
      selected: choose(evaluations, mode === "move" ? difficulty : "Goat"),
      meta: {
        model,
        calls,
        tokens,
        elapsedMs: Math.round(performance.now() - started),
        formula: formulaVersion,
        questions: questionVersion,
      },
    };
  };
}
// Fixed server-side prompt: the browser can trigger a warmup but never choose its content.
export function makeWarmupPing(client: Pick<TypeSafeClient, "systemOne">) {
  return async () => {
    const response = await client.systemOne(
      { state: { a: 1, b: 2 }, questions: { smaller: noul("Is a smaller than b?") } },
      {
        signal: AbortSignal.timeout(warmupTimeoutMs),
        timeout: warmupTimeoutMs,
        retry: { maxRetries: 0 },
      },
    );
    if (response.answers.smaller?.type !== "noul")
      throw new Error("Invalid warmup response");
  };
}
