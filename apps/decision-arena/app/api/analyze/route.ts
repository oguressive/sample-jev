import {
  cleanText,
  createRequestRateLimiter,
  createJevClient,
  readJsonObject,
  requestDeadline,
  safeErrorResponse,
  validateSystemAnswers,
} from "@sample-jev/jev-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 20;
const parsedRateLimit = Number.parseInt(process.env.JEV_EVALUATION_RATE_LIMIT ?? "20", 10);
const limitRequest = createRequestRateLimiter({
  limit: Number.isFinite(parsedRateLimit) && parsedRateLimit > 0 ? parsedRateLimit : 20,
  trustProxy: process.env.JEV_TRUST_PROXY === "true",
});

const optionCriteria = {
  a: "Option A is clearly stronger on this dimension.",
  b: "Option B is clearly stronger on this dimension.",
  tie: "They are equivalent, the evidence is insufficient, or the tradeoff is genuinely balanced.",
} as const;

export async function POST(request: Request): Promise<Response> {
  const rateLimitResponse = limitRequest(request);
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const raw = await readJsonObject(request);
    const state = {
      goal: cleanText(raw.goal, 1_500),
      option_a: cleanText(raw.optionA, 3_000),
      option_b: cleanText(raw.optionB, 3_000),
      constraints: cleanText(raw.constraints, 2_000),
    };

    if (state.goal.length < 8 || state.option_a.length < 8 || state.option_b.length < 8) {
      return Response.json(
        { error: "目的と2つの選択肢を、それぞれ8文字以上で入力してください。" },
        { status: 400 },
      );
    }

    const client = createJevClient();
    const result = await client.systemOne(
      {
        state,
        questions: {
          goal_fit: {
            type: "choice",
            instructions:
              "Which of `option_a` or `option_b` more directly achieves `goal`, while respecting `constraints`?",
            criteria: optionCriteria,
          },
          time_to_value: {
            type: "choice",
            instructions:
              "Which option is more likely to deliver meaningful value sooner, based only on the described scope and `constraints`?",
            criteria: optionCriteria,
          },
          reversibility: {
            type: "choice",
            instructions:
              "Which option is easier to stop, revise, or roll back if the initial decision is wrong?",
            criteria: optionCriteria,
          },
          user_impact: {
            type: "choice",
            instructions:
              "Which option is more likely to create meaningful positive impact for the users implied by `goal`?",
            criteria: optionCriteria,
          },
          operational_simplicity: {
            type: "choice",
            instructions:
              "Which option is simpler to operate and maintain after launch, based on the information provided?",
            criteria: optionCriteria,
          },
          downside_risk: {
            type: "choice",
            instructions:
              "Which option has the lower downside risk if assumptions fail or the implementation underperforms?",
            criteria: optionCriteria,
          },
        } as const,
      },
      { signal: requestDeadline() },
    );
    const answers = validateSystemAnswers<Record<DimensionKey, ComparisonAnswer>>(
      result.answers,
      Object.fromEntries(
        dimensions.map((key) => [
          key,
          { type: "choice", choices: ["a", "b", "tie"] },
        ]),
      ),
    );

    return Response.json(
      {
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

const dimensions = [
  "goal_fit",
  "time_to_value",
  "reversibility",
  "user_impact",
  "operational_simplicity",
  "downside_risk",
] as const;
type DimensionKey = typeof dimensions[number];
type ComparisonAnswer = {
  choice: "a" | "b" | "tie";
  confidence: number;
  probabilities: Record<string, number>;
};
