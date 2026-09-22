import { counts, legalMoves, positionKey, type Position } from "./rules.ts";
import { difficulties, type Difficulty } from "./game.ts";

export const formulaVersion = "weighted-v1";
export const questionVersion = "othello-v1";
export type Evaluation = {
  square: number;
  p: number;
  m: number;
  t: number;
  score: number;
  terminal: boolean;
};
export type Analysis = {
  key: string;
  revision: number;
  evaluations: Evaluation[];
  selected: number;
  meta: {
    model: string;
    calls: number;
    tokens: number;
    elapsedMs: number;
    formula: string;
    questions: string;
  };
};
export function weights(p: Position): [number, number, number] {
  const empty = counts(p).empty;
  return empty > 40
    ? [0.6, 0.3, 0.1]
    : empty > 16
      ? [0.75, 0.15, 0.1]
      : [0.9, 0.05, 0.05];
}
export function composite(position: Position, p: number, m: number, t: number) {
  const w = weights(position);
  return Math.max(
    1,
    Math.min(100, Math.round(1 + 99 * (w[0] * p + w[1] * m + w[2] * t) + 1e-9)),
  );
}
export const difficultyProfile = (d: Difficulty) => ({
  temperature: [0.45, 0.28, 0.14, 0.07, 0.035, 0.015, 0.005, 0][
    difficulties.indexOf(d)
  ],
  replies: difficulties.indexOf(d) >= 4,
});
export function choose(
  evaluations: Evaluation[],
  d: Difficulty,
  random = Math.random,
): number {
  if (!evaluations.length) throw new Error("評価がありません");
  const wins = evaluations.filter((e) => e.terminal && e.p === 1);
  const choices = wins.length ? wins : evaluations;
  const max = Math.max(...choices.map((e) => e.score));
  const temperature = difficultyProfile(d).temperature;
  if (!temperature) return choices.find((e) => e.score === max)!.square;
  const mass = choices.map((e) =>
    Math.exp((e.score - max) / (temperature * 99)),
  );
  let sample =
    Math.max(0, Math.min(0.999999999, random())) *
    mass.reduce((a, b) => a + b, 0);
  for (let i = 0; i < choices.length; i++) {
    sample -= mass[i];
    if (sample <= 0) return choices[i].square;
  }
  return choices.at(-1)!.square;
}
export function validateAnalysis(
  input: unknown,
  position: Position,
  revision: number,
): Analysis {
  const a = input as Analysis;
  const legal = legalMoves(position);
  if (
    !a ||
    a.key !== positionKey(position) ||
    a.revision !== revision ||
    !Array.isArray(a.evaluations) ||
    a.evaluations.length !== legal.length ||
    new Set(a.evaluations.map((e) => e.square)).size !== legal.length ||
    !legal.includes(a.selected) ||
    !a.meta ||
    a.meta.formula !== formulaVersion ||
    a.meta.questions !== questionVersion ||
    typeof a.meta.model !== "string" ||
    ![a.meta.calls, a.meta.tokens, a.meta.elapsedMs].every(
      (n) => Number.isFinite(n) && n >= 0,
    )
  )
    throw new Error("評価応答が不正です");
  for (const e of a.evaluations) {
    if (
      !legal.includes(e.square) ||
      ![e.p, e.m, e.t].every((n) => Number.isFinite(n) && n >= 0 && n <= 1) ||
      !Number.isInteger(e.score) ||
      e.score < 1 ||
      e.score > 100 ||
      typeof e.terminal !== "boolean"
    )
      throw new Error("評価値が不正です");
  }
  return a;
}
