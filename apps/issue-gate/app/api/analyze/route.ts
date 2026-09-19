import {
  cleanText,
  createRequestRateLimiter,
  createJevClient,
  readJsonObject,
  requestDeadline,
  safeErrorResponse,
  validateSystemAnswers,
} from "@sample-jev/jev-server";
import { decideIssueReadiness } from "./policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
const parsedRateLimit = Number.parseInt(process.env.JEV_EVALUATION_RATE_LIMIT ?? "20", 10);
const limitRequest = createRequestRateLimiter({
  limit: Number.isFinite(parsedRateLimit) && parsedRateLimit > 0 ? parsedRateLimit : 20,
  trustProxy: process.env.JEV_TRUST_PROXY === "true",
});

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = limitRequest(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const raw = await readJsonObject(request);
    const state = {
      title: cleanText(raw.title, 300),
      environment: cleanText(raw.environment, 1_000),
      steps: cleanText(raw.steps, 4_000),
      expected: cleanText(raw.expected, 2_000),
      actual: cleanText(raw.actual, 3_000),
    };

    if (`${state.title} ${state.actual}`.trim().length < 20) {
      return Response.json(
        { error: "タイトルと実際の結果を、合計20文字以上で入力してください。" },
        { status: 400 },
      );
    }

    const client = createJevClient();
    const result = await client.systemOne(
      {
        state,
        questions: {
          category: {
            type: "choice",
            instructions:
              "Classify the report represented by `title`, `steps`, `expected`, and `actual`.",
            criteria: {
              bug: "Existing behavior is broken, incorrect, or regressed.",
              feature: "The report mainly asks for new or changed behavior.",
              question: "The report mainly asks how something works or how to use it.",
              other: "The report does not clearly fit the other categories.",
            },
          },
          reproducibility: {
            type: "score",
            instructions:
              "How reproducible is the problem using only `environment` and `steps`?",
            criteria: [
              "There are no actionable reproduction details.",
              "Some context exists, but a key setup condition or action is missing.",
              "A developer can probably reproduce it, with minor assumptions.",
              "The environment, starting condition, and ordered actions are explicit.",
            ],
          },
          expected_present: {
            type: "noul",
            instructions:
              "Does `expected` clearly state the behavior the reporter expected to observe?",
          },
          actual_present: {
            type: "noul",
            instructions:
              "Does `actual` clearly state what happened, including an observable symptom?",
          },
          sufficient_context: {
            type: "noul",
            instructions:
              "Taken together, do `title`, `environment`, `steps`, `expected`, and `actual` contain enough concrete context for an engineer to begin investigation?",
          },
          impact: {
            type: "score",
            instructions:
              "Assess the user impact explicitly described in the complete report.",
            criteria: [
              "Cosmetic issue or no user impact is described.",
              "Minor friction; the main task remains available.",
              "A meaningful task is impaired, but a workaround exists or the scope is limited.",
              "A core task is blocked, data or money is at risk, or many users are affected.",
            ],
          },
        } as const,
      },
      { signal: requestDeadline() },
    );

    const answers = validateSystemAnswers<IssueAnswers>(result.answers, {
      category: { type: "choice", choices: ["bug", "feature", "question", "other"] },
      reproducibility: { type: "score" },
      expected_present: { type: "noul" },
      actual_present: { type: "noul" },
      sufficient_context: { type: "noul" },
      impact: { type: "score" },
    });
    const decision = decideIssueReadiness(answers);

    return Response.json(
      {
        ...decision,
        answers,
        model: result.model,
        usage: result.usage,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return safeErrorResponse(error);
  }
}

type IssueAnswers = {
  category: { choice: "bug" | "feature" | "question" | "other"; confidence: number; probabilities: Record<string, number> };
  reproducibility: { score: number; confidence: number; probabilities: Record<string, number> };
  expected_present: { noul: number };
  actual_present: { noul: number };
  sufficient_context: { noul: number };
  impact: { score: number; confidence: number; probabilities: Record<string, number> };
};
