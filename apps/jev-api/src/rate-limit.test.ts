import assert from "node:assert/strict";
import test from "node:test";
import { createFixedWindowRateLimiter } from "./rate-limit.ts";

test("fixed-window limiter rejects excess calls and resets after the window", () => {
  let time = 1_000;
  const take = createFixedWindowRateLimiter({
    limit: 2,
    windowMs: 10_000,
    now: () => time,
  });

  assert.deepEqual(take("client-a"), {
    allowed: true,
    limit: 2,
    remaining: 1,
    retryAfterSeconds: 10,
  });
  assert.equal(take("client-a").allowed, true);
  const rejected = take("client-a");
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.remaining, 0);

  assert.equal(take("client-b").allowed, true);
  time += 10_000;
  assert.equal(take("client-a").allowed, true);
});
