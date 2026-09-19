import {
  cleanText,
  createJevClient,
  readJsonObject,
  requestDeadline,
  safeErrorResponse,
} from "@sample-jev/jev-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
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

    const answers = result.answers;
    const readiness =
      (answers.reproducibility.score / 3) * 0.35 +
      answers.expected_present.noul * 0.2 +
      answers.actual_present.noul * 0.2 +
      answers.sufficient_context.noul * 0.25;

    const missing: string[] = [];
    if (answers.reproducibility.score < 1.8) missing.push("再現手順を、開始条件から順番に書く");
    if (answers.expected_present.noul < 0.7) missing.push("期待した結果を1文で明記する");
    if (answers.actual_present.noul < 0.7) missing.push("実際に起きた症状・エラーを明記する");
    if (answers.sufficient_context.noul < 0.65) missing.push("発生環境・頻度・直前の操作を補う");

    const ready =
      readiness >= 0.72 &&
      answers.category.choice !== "other" &&
      answers.category.confidence >= 0.5;

    return Response.json(
      {
        verdict: ready ? "ready" : "needs_context",
        readiness,
        missing,
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
