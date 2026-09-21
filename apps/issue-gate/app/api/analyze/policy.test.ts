import assert from "node:assert/strict";
import test from "node:test";
import { decideIssueReadiness } from "./policy.ts";

test("an issue with required edits cannot be marked ready", () => {
  const decision = decideIssueReadiness({
    category: { choice: "bug", confidence: 0.9 },
    reproducibility: { score: 1.7 },
    expected_present: { noul: 0.9 },
    actual_present: { noul: 0.9 },
    sufficient_context: { noul: 0.9 },
  });

  assert.ok(decision.readiness >= 0.72);
  assert.equal(decision.verdict, "needs_context");
  assert.deepEqual(decision.missing, ["再現手順を、開始条件から順番に書く"]);
});
