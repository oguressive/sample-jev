import assert from "node:assert/strict";
import test from "node:test";
import { experimental_composeSpec, type Experimental_CompositionEvaluator } from "@json-render/core";
import { buildCanvasCandidates, canvasCatalog, validateCanvasComposition } from "./index.ts";

test("canvas candidates keep roots and actions mutually exclusive", () => {
  const candidates = buildCanvasCandidates({
    title: "Reliability brief", audience: "Engineering leads", goal: "Choose the safest next action",
    facts: "Error rate increased after deployment.", metrics: "Error rate | 4.2%", risks: "Peak begins soon", actions: "Rollback\nOpen incident channel",
  });
  assert.equal(candidates.filter((item) => item.resource === "canvas-root").length, 3);
  assert.equal(candidates.filter((item) => item.resource === "primary-action").length, 3);
  assert.equal(candidates.some((item) => item.id === "metrics"), true);
  assert.equal(candidates.every((item) => !JSON.stringify(item).includes("TYPESAFE_API_KEY")), true);
});

test("official composer preserves prepared text, enforces action capabilities, and orders children", async () => {
  const input = { title: "Garden brief", audience: "Volunteers", goal: "Review next actions first", facts: "Forty volunteers joined.", metrics: "Volunteers | 40", risks: "Water supply uncertain", actions: "Check water supply" };
  let calls = 0;
  const evaluate: Experimental_CompositionEvaluator = async ({ questions }) => {
    calls++;
    return { answers: Object.fromEntries(Object.entries(questions).map(([key, question]) => {
      const keys = Object.keys(question.criteria);
      const choice = key === "root" ? "canvas-action_board" : key.startsWith("select_") ? keys.find((option) => option.startsWith("use:"))! : keys[0];
      return [key, { choice, confidence: 0.9 }];
    })) };
  };
  let final;
  for await (const event of experimental_composeSpec({ catalog: canvasCatalog, candidates: buildCanvasCandidates(input), prompt: input.goal, evaluate, maxSteps: 2, maxElements: 10 })) {
    if (event.type === "complete") final = event;
  }
  assert.equal(final?.stopReason, "finish");
  assert.equal(calls, 2);
  assert.ok(final?.spec);
  const elements = Object.values(final.spec.elements);
  assert.equal(elements.filter((element) => element.type === "Canvas").length, 1);
  assert.equal(elements.filter((element) => element.type === "ActionBar").length, 1);
  assert.equal(elements.find((element) => element.type === "BriefHeader")?.props.title, input.title);
  assert.ok(canvasCatalog.validate(final.spec).success);
  assert.ok(validateCanvasComposition(final.spec));
});

test("completed canvases still reject omitted required content and action", async () => {
  const candidates = buildCanvasCandidates({ title: "Test brief", audience: "Test audience", goal: "Review provided facts", facts: "Known facts only", metrics: "Count | 1", risks: "No stated risks", actions: "Review" });
  let final;
  for await (const event of experimental_composeSpec({
    catalog: canvasCatalog,
    candidates,
    prompt: "Include the required header and one action",
    evaluate: async ({ questions }) => ({
      answers: Object.fromEntries(Object.entries(questions).map(([key, question]) => {
        const choices = Object.keys(question.criteria);
        return [key, { choice: key === "root" ? choices[0] : choices.includes("omit") ? "omit" : choices[0] }];
      })),
    }),
    maxSteps: 2,
  })) {
    if (event.type === "complete") final = event;
  }
  assert.equal(final?.stopReason, "finish");
  assert.ok(final?.spec);
  assert.equal(canvasCatalog.validate(final.spec).success, true);
  assert.equal(validateCanvasComposition(final.spec), false);
});

test("official composer rejects evaluator choices outside the catalog", async () => {
  const candidates = buildCanvasCandidates({ title: "Test brief", audience: "Test audience", goal: "Review provided facts", facts: "Known facts only", metrics: "Count | 1", risks: "No stated risks", actions: "Review" });
  await assert.rejects(async () => {
    for await (const event of experimental_composeSpec({ catalog: canvasCatalog, candidates, prompt: "Test", evaluate: async ({ questions }) => ({ answers: Object.fromEntries(Object.keys(questions).map((key) => [key, { choice: "execute_arbitrary_code" }])) }) })) void event;
  });
});
