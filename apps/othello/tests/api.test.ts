import test from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp } from "../server/app.ts";
import {
  makeEvaluator,
  makeWarmupPing,
  parseRequest,
  type EvaluationRequest,
} from "../server/evaluate.ts";
import { createWarmer } from "../server/warmup.ts";
import {
  initial,
  legalMoves,
  opposite,
  play,
  positionKey,
  type Position,
} from "../src/core/rules.ts";
import {
  evaluationBatches,
  evaluationDeadlineMs,
  formulaVersion,
  questionVersion,
  upstreamTimeoutMs,
  warmupTimeoutMs,
  type Analysis,
} from "../src/core/evaluation.ts";
import { clientDeadlineMs } from "../src/client.ts";

const request: EvaluationRequest = {
  position: initial(),
  revision: 0,
  difficulty: "Normal",
  mode: "move",
};
const mockAnalysis = (): Analysis => ({
  key: positionKey(initial()),
  revision: 0,
  evaluations: legalMoves(initial()).map((square) => ({
    square,
    p: 0.5,
    m: 0.5,
    t: 0.5,
    score: 51,
    terminal: false,
  })),
  selected: 19,
  meta: {
    model: "test-only",
    calls: 1,
    tokens: 2,
    elapsedMs: 1,
    formula: formulaVersion,
    questions: questionVersion,
  },
});
const post = (body: unknown = request, origin = "http://127.0.0.1:3011") =>
  new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });

test("API missing configuration returns actionable error without substitution", async () => {
  const app = createApp(null);
  assert.equal((await app.request("/api/health")).status, 200);
  const response = await app.request(post());
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});
test("API validates origin, payload size and malformed positions before calls", async () => {
  let calls = 0;
  const app = createApp(async () => {
    calls++;
    return mockAnalysis();
  });
  assert.equal(
    (await app.request(post({}, "https://untrusted.example"))).status,
    403,
  );
  assert.equal(
    (await app.request(post({ ...request, position: { board: [], turn: 1 } })))
      .status,
    400,
  );
  assert.equal(
    (await app.request(post({ junk: "x".repeat(20_000) }))).status,
    413,
  );
  assert.equal(
    (
      await app.request(
        new Request("http://localhost/api/evaluate", {
          method: "POST",
          body: "{}",
        }),
      )
    ).status,
    415,
  );
  assert.equal(calls, 0);
  assert.equal((await app.request(post())).status, 200);
  assert.equal(calls, 1);
});
test("API strips upstream error bodies and enforces total rate budget", async () => {
  const fail = createApp(async () => {
    throw new Error("upstream-sensitive-test-body");
  });
  const response = await fail.request(post());
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes("upstream-sensitive"));
  const app = createApp(async () => mockAnalysis());
  for (let i = 0; i < 60; i++)
    assert.equal((await app.request(post())).status, 200);
  assert.equal((await app.request(post())).status, 429);
});
test("API concurrency gate releases slots after completion", async () => {
  const releases: (() => void)[] = [];
  const app = createApp(async () => {
    await new Promise<void>((resolve) => releases.push(resolve));
    return mockAnalysis();
  });
  const first = app.request(post()),
    second = app.request(post());
  while (releases.length < 2)
    await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await app.request(post())).status, 429);
  releases.forEach((resolve) => resolve());
  assert.equal((await first).status, 200);
  assert.equal((await second).status, 200);
});
test("Jev adapter sends bounded atomic questions and computes weighted response from real SDK transport mock", async () => {
  const bodies: Record<string, unknown>[] = [];
  const client = new TypeSafeClient({
    apiKey: "test-only-not-a-secret",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const answers = Object.fromEntries(
        Object.keys(body.questions).map((key) => [
          key,
          key.endsWith("_p")
            ? { type: "noul", noul: 0.7 }
            : {
                type: "score",
                score: 3,
                confidence: 0.8,
                probabilities: { 0: 0, 1: 0, 2: 0, 3: 1, 4: 0 },
                legend: { 0: "bad", 1: "low", 2: "mid", 3: "good", 4: "best" },
              },
        ]),
      );
      return Response.json({
        model: "test-only",
        answers,
        usage: { input_tokens: 10, output_tokens: 20 },
      });
    },
  });
  const analyze = makeEvaluator(client);
  const result = await analyze(
    { ...request, mode: "hint" },
    new AbortController().signal,
  );
  assert.equal(bodies.length, 1);
  assert.equal(Object.keys(bodies[0].questions as object).length, 12);
  assert.equal(result.evaluations.length, 4);
  assert.equal(result.evaluations[0].p, 0.7);
  assert.equal(result.evaluations[0].m, 0.75);
  assert.equal(result.evaluations[0].score, 72);
  assert.equal(result.meta.tokens, 30);
  assert.equal(result.meta.calls, 1);
  const state = bodies[0].state as { candidates: { replyFacts?: unknown }[] };
  assert.ok(state.candidates[0].replyFacts);
});
test("Jev failures do not retry, fabricate moves or swallow invalid output", async () => {
  let calls = 0;
  const client = new TypeSafeClient({
    apiKey: "test-only-not-a-secret",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async () => {
      calls++;
      return Response.json({ error: "test" }, { status: 500 });
    },
  });
  await assert.rejects(
    makeEvaluator(client)(request, new AbortController().signal),
  );
  assert.equal(calls, 1);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(makeEvaluator(client)(request, controller.signal));
  assert.equal(calls, 1);
  assert.throws(() => parseRequest({ ...request, mode: "other" }));
  assert.throws(() => parseRequest({ ...request, revision: -1 }));
});

const mockJev = (bodies: Record<string, unknown>[]) =>
  new TypeSafeClient({
    apiKey: "test-only-not-a-secret",
    logLevel: "off",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const answers = Object.fromEntries(
        Object.keys(body.questions).map((key) => [
          key,
          key.endsWith("_m") || key.endsWith("_t")
            ? {
                type: "score",
                score: 2,
                confidence: 0.8,
                probabilities: { 0: 0, 1: 0, 2: 1, 3: 0, 4: 0 },
                legend: { 0: "a", 1: "b", 2: "c", 3: "d", 4: "e" },
              }
            : { type: "noul", noul: 0.6 },
        ]),
      );
      return Response.json({
        model: "test-only",
        answers,
        usage: { input_tokens: 1, output_tokens: 1 },
      });
    },
  });
function wideMidgame(minimum: number): Position {
  let p = initial(),
    rng = 7;
  for (let i = 0; i < 60; i++) {
    const legal = legalMoves(p);
    if (legal.length >= minimum) return p;
    if (!legal.length) p = { ...p, turn: opposite(p.turn) };
    else {
      rng = (rng * 1664525 + 1013904223) >>> 0;
      p = play(p, legal[rng % legal.length]);
    }
  }
  throw new Error("fixture position not found");
}
test("route and client deadlines cover every sequential batch", async () => {
  const wide = wideMidgame(9);
  assert.equal(evaluationBatches(initial()), 1);
  assert.equal(evaluationBatches(wide), 2);
  assert.equal(evaluationDeadlineMs(wide), 2 * upstreamTimeoutMs + 5_000);
  assert.ok(
    clientDeadlineMs(wide) >= evaluationDeadlineMs(wide) + warmupTimeoutMs,
  );
  const bodies: Record<string, unknown>[] = [];
  const result = await makeEvaluator(mockJev(bodies))(
    { position: wide, revision: 3, difficulty: "Normal", mode: "move" },
    new AbortController().signal,
  );
  assert.equal(bodies.length, 2);
  assert.equal(result.meta.calls, 2);
  assert.equal(result.evaluations.length, legalMoves(wide).length);
});
test("candidate facts name each side's mobility and passes consistently", async () => {
  const bodies: Record<string, unknown>[] = [];
  await makeEvaluator(mockJev(bodies))(
    { ...request, mode: "hint" },
    new AbortController().signal,
  );
  type Fact = {
    reply: string;
    actingPlayerMobility: number;
    opponentMobility: number;
    actingPlayerMustPass: boolean;
  };
  const state = bodies[0].state as {
    candidates: {
      square: string;
      legalReplies: string[];
      opponentMobility: number;
      opponentMustPass: boolean;
      replyFacts: Fact[];
    }[];
  };
  const p = initial();
  for (const [i, square] of legalMoves(p).entries()) {
    const candidate = state.candidates[i],
      after = play(p, square);
    assert.equal(candidate.opponentMobility, candidate.legalReplies.length);
    assert.equal(candidate.opponentMustPass, false);
    for (const [j, reply] of legalMoves(after).entries()) {
      const next = play(after, reply),
        fact = candidate.replyFacts[j];
      assert.equal(fact.actingPlayerMobility, legalMoves(next, p.turn).length);
      assert.equal(
        fact.opponentMobility,
        legalMoves(next, opposite(p.turn)).length,
      );
      assert.equal(fact.actingPlayerMustPass, fact.actingPlayerMobility === 0);
    }
  }
});
test("warmup is single-flight and bounded however often TOP is opened", async () => {
  let t = 0,
    pings = 0,
    finish!: () => void;
  const warmer = createWarmer(
    () => {
      pings++;
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
    { now: () => t, warmForMs: 300_000, failureCooldownMs: 60_000, maxPerHour: 3 },
  );
  const app = createApp(async () => mockAnalysis(), undefined, warmer);
  const warm = () =>
    app.request(
      new Request("http://localhost/api/warmup", {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:3011" },
      }),
    );
  for (let i = 0; i < 100; i++)
    assert.equal((await (await warm()).json()).state, "warming");
  assert.equal(pings, 1);
  finish();
  await new Promise((resolve) => setImmediate(resolve));
  for (let i = 0; i < 100; i++)
    assert.equal((await (await warm()).json()).state, "warm");
  assert.equal(pings, 1);
  t = 299_999;
  assert.equal(warmer.request(), "warm");
  warmer.markSuccess();
  t = 599_998;
  assert.equal(warmer.request(), "warm");
  t = 600_000;
  assert.equal(warmer.request(), "warming");
  assert.equal(pings, 2);
  assert.equal(
    (
      await app.request(
        new Request("http://localhost/api/warmup", {
          method: "POST",
          headers: { Origin: "https://untrusted.example" },
        }),
      )
    ).status,
    403,
  );
  assert.equal(pings, 2);
});
test("warmup failures cool down and the hourly cap holds", async () => {
  let t = 0,
    pings = 0;
  const warmer = createWarmer(
    async () => {
      pings++;
      throw new Error("test failure");
    },
    { now: () => t, failureCooldownMs: 60_000, maxPerHour: 3 },
  );
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  assert.equal(warmer.request(), "warming");
  await settle();
  assert.equal(warmer.request(), "cooldown");
  for (const at of [60_000, 120_000]) {
    t = at;
    assert.equal(warmer.request(), "warming");
    await settle();
  }
  t = 180_000;
  assert.equal(warmer.request(), "limited");
  assert.equal(pings, 3);
  t = 3_600_000;
  assert.equal(warmer.request(), "warming");
  assert.equal(pings, 4);
  assert.equal(createWarmer(null).request(), "unconfigured");
});
test("evaluation waits for an in-flight warmup, then refreshes warm state", async () => {
  const order: string[] = [];
  let finish!: () => void;
  const warmer = createWarmer(
    () =>
      new Promise<void>((resolve) => {
        finish = () => {
          order.push("warmup-done");
          resolve();
        };
      }),
  );
  const app = createApp(
    async () => {
      order.push("evaluate");
      return mockAnalysis();
    },
    undefined,
    warmer,
  );
  assert.equal(warmer.request(), "warming");
  const pending = app.request(post());
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(order, []);
  finish();
  assert.equal((await pending).status, 200);
  assert.deepEqual(order, ["warmup-done", "evaluate"]);
  assert.equal(warmer.request(), "warm");
});
test("warmup ping sends only a fixed tiny question", async () => {
  const bodies: Record<string, unknown>[] = [];
  await makeWarmupPing(mockJev(bodies))();
  assert.equal(bodies.length, 1);
  assert.deepEqual(Object.keys(bodies[0].questions as object), ["smaller"]);
  assert.deepEqual(bodies[0].state, { a: 1, b: 2 });
});
