import assert from "node:assert/strict";
import test from "node:test";
import {
  JevAnswerValidationError,
  JevInputError,
  createFixedWindowRateLimiter,
  createRequestRateLimiter,
  readJsonObject,
  safeErrorResponse,
  validateSystemAnswers,
} from "./index.ts";

test("readJsonObject accepts objects and rejects malformed or non-object JSON", async () => {
  assert.deepEqual(
    await readJsonObject(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ message: "hello" }),
    })),
    { message: "hello" },
  );

  await assert.rejects(
    readJsonObject(new Request("http://localhost", { method: "POST", body: "{" })),
    JevInputError,
  );
  await assert.rejects(
    readJsonObject(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(["not", "an", "object"]),
    })),
    JevInputError,
  );
});

test("input errors are returned as client errors without leaking details", async () => {
  const response = safeErrorResponse(new JevInputError());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "A valid JSON object is required." });
});

test("validateSystemAnswers rejects invalid choices and out-of-range numbers", () => {
  const shapes = {
    category: { type: "choice", choices: ["safe", "review"] },
    severity: { type: "score" },
    visible: { type: "noul" },
  } as const;
  const valid = {
    category: { choice: "safe", confidence: 0.9, probabilities: { safe: 0.9, review: 0.1 } },
    severity: { score: 1.2, confidence: 0.8, probabilities: { "1": 0.8 } },
    visible: { noul: 0.4 },
  };

  assert.equal(validateSystemAnswers<typeof valid>(valid, shapes), valid);
  assert.throws(
    () => validateSystemAnswers({ ...valid, category: { ...valid.category, choice: "unknown" } }, shapes),
    JevAnswerValidationError,
  );
  assert.throws(
    () => validateSystemAnswers({ ...valid, visible: { noul: 1.2 } }, shapes),
    JevAnswerValidationError,
  );
  assert.throws(
    () => validateSystemAnswers({ ...valid, severity: { ...valid.severity, confidence: Number.NaN } }, shapes),
    JevAnswerValidationError,
  );
});

test("readJsonObject enforces the request-size limit", async () => {
  const request = new Request("http://localhost", {
    method: "POST",
    body: JSON.stringify({ value: "x".repeat(128) }),
  });
  await assert.rejects(readJsonObject(request, 64));
});

test("fixed-window limiter rejects excess calls and resets after the window", () => {
  let time = 1_000;
  const take = createFixedWindowRateLimiter({
    limit: 2,
    windowMs: 10_000,
    now: () => time,
  });

  assert.equal(take("client-a").allowed, true);
  assert.equal(take("client-a").allowed, true);
  assert.equal(take("client-a").allowed, false);
  assert.equal(take("client-b").allowed, true);
  time += 10_000;
  assert.equal(take("client-a").allowed, true);
});

test("request limiter returns 429 after the configured budget", async () => {
  const limit = createRequestRateLimiter({ limit: 1 });
  const request = new Request("http://localhost");
  assert.equal(limit(request), null);
  const response = limit(request);
  assert.equal(response?.status, 429);
  assert.equal(response?.headers.get("Retry-After"), "60");
});
