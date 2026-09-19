import assert from "node:assert/strict";
import test from "node:test";
import {
  decideClaim,
  decideExperiment,
  decideIncident,
  decideProgramMatch,
  decideRelease,
  decideStackFit,
  decideTrust,
  type ChoiceAnswer,
  type ScoreAnswer,
} from "./index.ts";

function choice<T extends string>(value: T, confidence = 0.9): ChoiceAnswer<T> {
  return { choice: value, confidence, probabilities: { [value]: 1 } };
}

function score(value: number, confidence = 0.9): ScoreAnswer {
  return { score: value, confidence, probabilities: { [String(value)]: 1 } };
}

test("Stack Fit selects Vite + Hono for authenticated SPA-shaped products", () => {
  const decision = decideStackFit({
    audience: choice("authenticated"),
    seo_need: score(0.3),
    static_dominance: { noul: 0.1 },
    server_rendering_value: score(0.6),
    complex_server_dependencies: { noul: 0.2 },
    portability_priority: score(2.4),
  });
  assert.equal(decision.recommended, "vite_hono");
  assert.equal(decision.reviewRequired, false);
});

test("Stack Fit selects Next.js only when all public SSR conditions are strong", () => {
  const decision = decideStackFit({
    audience: choice("public_indexed"),
    seo_need: score(2.7),
    static_dominance: { noul: 0.2 },
    server_rendering_value: score(2.5),
    complex_server_dependencies: { noul: 0.8 },
    portability_priority: score(0.8),
  });
  assert.equal(decision.recommended, "nextjs");
});

test("Stack Fit prioritizes full SSR requirements over static dominance", () => {
  const decision = decideStackFit({
    audience: choice("public_indexed"),
    seo_need: score(2.7),
    static_dominance: { noul: 0.8 },
    server_rendering_value: score(2.5),
    complex_server_dependencies: { noul: 0.8 },
    portability_priority: score(0.8),
  });
  assert.equal(decision.recommended, "nextjs");
});

test("Release Sentinel holds a critical change without a rollback", () => {
  const decision = decideRelease({
    blast_radius: score(2.5),
    critical_surface: choice("payments"),
    schema_change: { noul: 0.8 },
    rollback_quality: score(0.7),
    validation_evidence: score(1.5),
    release_order_dependency: { noul: 0.7 },
  });
  assert.equal(decision.verdict, "hold");
});

test("Release Sentinel explains a review caused by broad blast radius", () => {
  const decision = decideRelease({
    blast_radius: score(1.8),
    critical_surface: choice("none"),
    schema_change: { noul: 0.1 },
    rollback_quality: score(2.5),
    validation_evidence: score(2.5),
    release_order_dependency: { noul: 0.1 },
  });
  assert.equal(decision.verdict, "review");
  assert.ok(decision.flags.includes("影響範囲が広い"));
});

test("Experiment Gate requires review for a high-harm sensitive experiment", () => {
  const decision = decideExperiment({
    falsifiable_hypothesis: { noul: 0.9 },
    metric_alignment: score(2.5),
    harm_risk: score(2.4),
    reversibility: score(2.2),
    guardrail_present: { noul: 0.9 },
    sensitive_domain: choice("health_finance"),
  });
  assert.equal(decision.verdict, "review");
});

test("Claim Guard blocks an unsupported absolute claim", () => {
  const decision = decideClaim({
    evidence_support: score(0.5),
    claim_strength: choice("absolute"),
    regulated_domain: choice("none"),
    omission_risk: score(2.5),
    evidence_match: { noul: 0.2 },
  });
  assert.equal(decision.verdict, "block");
});

test("Trust Queue escalates imminent harm without applying a sanction", () => {
  const decision = decideTrust({
    category: choice("self_harm"),
    severity: score(2.7),
    targeted_person: { noul: 0.2 },
    imminent_risk: { noul: 0.85 },
    context_ambiguity: score(1.2),
  });
  assert.equal(decision.verdict, "escalate");
});

test("Incident Navigator sends severe non-security incidents to a war room", () => {
  const decision = decideIncident({
    domain: choice("availability"),
    urgency: score(2.7),
    blast_radius: score(2.6),
    customer_visible: { noul: 0.9 },
    evidence_quality: score(2.1),
  });
  assert.equal(decision.track, "war_room");
  assert.equal(decision.humanLeadRequired, true);
});

test("Program Match rejects an explicit eligibility conflict", () => {
  const decision = decideProgramMatch({
    mission_match: score(2.5),
    eligibility_conflict: { noul: 0.9 },
    evidence_strength: score(2.2),
    delivery_readiness: score(2.1),
    downside_risk: score(0.6),
  });
  assert.equal(decision.verdict, "not_fit");
});

test("Program Match cannot return strong fit with a possible eligibility conflict", () => {
  const decision = decideProgramMatch({
    mission_match: score(2.5),
    eligibility_conflict: { noul: 0.55 },
    evidence_strength: score(2.2),
    delivery_readiness: score(2.1),
    downside_risk: score(0.6),
  });
  assert.equal(decision.verdict, "human_review");
});
