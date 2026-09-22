import test from "node:test";
import assert from "node:assert/strict";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp } from "../server/app.ts";
import {
  makeEvaluator,
  parseRequest,
  type EvaluationRequest,
} from "../server/evaluate.ts";
import { initial, legalMoves, positionKey } from "../src/core/rules.ts";
import {
  formulaVersion,
  questionVersion,
  type Analysis,
} from "../src/core/evaluation.ts";

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
