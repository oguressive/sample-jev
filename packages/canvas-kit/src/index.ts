import { defineCatalog, type Experimental_CompositionCandidate } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import type { CanvasInput, CanvasSpec } from "@sample-jev/contracts";
import { z } from "zod";

export const canvasCatalog = defineCatalog(schema, {
  components: {
    Canvas: {
      props: z.object({ layout: z.enum(["spotlight", "dashboard", "action_board"]), density: z.enum(["calm", "compact"]) }),
      slots: ["default"],
      description: "Root canvas that owns visual layout and spacing.",
    },
    BriefHeader: {
      props: z.object({ eyebrow: z.string(), title: z.string(), summary: z.string() }),
      description: "Prepared title, audience, and purpose. Usually belongs near the beginning.",
    },
    MetricStrip: {
      props: z.object({ items: z.array(z.string()).max(4) }),
      description: "Prepared quantitative facts formatted as label | value lines.",
    },
    EvidencePanel: {
      props: z.object({ title: z.string(), body: z.string() }),
      description: "Known facts and evidence supplied by the user.",
    },
    RiskPanel: {
      props: z.object({ items: z.array(z.string()).max(5), urgent: z.boolean() }),
      description: "Prepared risks. Place earlier when the goal is urgent decision-making.",
    },
    ActionList: {
      props: z.object({ items: z.array(z.string()).max(6) }),
      description: "Prepared next actions, ordered exactly as supplied.",
    },
    ActionBar: {
      props: z.object({ mode: z.enum(["review", "share", "investigate"]), label: z.string() }),
      events: ["press"],
      description: "One safe local action. It never calls an external business system.",
    },
  },
  actions: {
    review: { params: z.object({ title: z.string() }), description: "Mark the rendered brief reviewed in local state." },
    share: { params: z.object({ title: z.string() }), description: "Copy the prepared brief title locally." },
    investigate: { params: z.object({ title: z.string() }), description: "Open a local investigation state." },
  },
});

function lines(value: string, limit: number) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, limit);
}

export function validateCanvasComposition(spec: unknown): spec is CanvasSpec {
  const validation = canvasCatalog.validate(spec);
  if (!validation.success || !validation.data) return false;

  const elements = Object.values(validation.data.elements);
  return (
    elements.filter((element) => element.type === "Canvas").length === 1 &&
    elements.filter((element) => element.type === "BriefHeader").length === 1 &&
    elements.filter((element) => element.type === "ActionBar").length === 1
  );
}

export function buildCanvasCandidates(input: CanvasInput): Experimental_CompositionCandidate[] {
  const roots: Experimental_CompositionCandidate[] = [
    ["spotlight", "calm", "Narrative spotlight for a concise executive message"],
    ["dashboard", "compact", "Metric-led dashboard for scanning quantitative status"],
    ["action_board", "compact", "Action board that prioritizes risks and next steps"],
  ].map(([layout, density, description]) => ({
    id: `canvas-${layout}`,
    resource: "canvas-root",
    description,
    element: { type: "Canvas", props: { layout, density } },
  }));

  const candidates: Experimental_CompositionCandidate[] = [
    ...roots,
    {
      id: "header",
      root: false,
      description: `Required header for ${input.audience}. Goal: ${input.goal}`,
      element: { type: "BriefHeader", props: { eyebrow: input.audience, title: input.title, summary: input.goal } },
    },
    {
      id: "evidence",
      root: false,
      description: `Known facts supporting the brief: ${input.facts}`,
      element: { type: "EvidencePanel", props: { title: "Known facts", body: input.facts } },
    },
  ];

  const metrics = lines(input.metrics, 4);
  if (metrics.length) candidates.push({ id: "metrics", root: false, description: `Quantitative facts: ${metrics.join("; ")}`, element: { type: "MetricStrip", props: { items: metrics } } });
  const risks = lines(input.risks, 5);
  if (risks.length) candidates.push({ id: "risks", root: false, description: `Risks that may need visual priority: ${risks.join("; ")}`, element: { type: "RiskPanel", props: { items: risks, urgent: /urgent|immediate|now|至急|緊急/.test(input.goal.toLowerCase()) } } });
  const actions = lines(input.actions, 6);
  if (actions.length) candidates.push({ id: "actions", root: false, description: `Prepared next actions: ${actions.join("; ")}`, element: { type: "ActionList", props: { items: actions } } });

  const actionVariants = [
    ["review", "Mark reviewed", "Use when acknowledgement is the safest useful next step"],
    ["share", "Copy title", "Use when the audience needs to share the prepared brief"],
    ["investigate", "Open investigation", "Use when unresolved evidence or risk needs follow-up"],
  ] as const;
  for (const [mode, label, description] of actionVariants) {
    candidates.push({
      id: `action-${mode}`,
      root: false,
      resource: "primary-action",
      description,
      element: {
        type: "ActionBar",
        props: { mode, label },
        on: { press: { action: mode, params: { title: input.title } } },
      },
    });
  }
  return candidates;
}
