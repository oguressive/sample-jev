export type IssuePolicyAnswers = {
  category: { choice: "bug" | "feature" | "question" | "other"; confidence: number };
  reproducibility: { score: number };
  expected_present: { noul: number };
  actual_present: { noul: number };
  sufficient_context: { noul: number };
};

export function decideIssueReadiness(answers: IssuePolicyAnswers) {
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
    missing.length === 0 &&
    answers.category.choice !== "other" &&
    answers.category.confidence >= 0.5;

  return {
    verdict: ready ? "ready" as const : "needs_context" as const,
    readiness,
    missing,
  };
}
