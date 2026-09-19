import assert from "node:assert/strict";
import test from "node:test";
import { JevInputError, readJsonObject, safeErrorResponse } from "./index.ts";

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
