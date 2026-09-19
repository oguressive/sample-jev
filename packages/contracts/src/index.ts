export type ChoiceAnswer<T extends string = string> = {
  choice: T;
  confidence: number;
  probabilities: Record<string, number>;
};

export type ScoreAnswer = {
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
};

export type NoulAnswer = { noul: number };

export type EvaluationMeta = {
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

export type StackKey = "nextjs" | "astro" | "vite_hono" | "react_router";

export type StackFitAnswers = {
  audience: ChoiceAnswer<"public_indexed" | "authenticated" | "internal">;
  seo_need: ScoreAnswer;
  static_dominance: NoulAnswer;
  server_rendering_value: ScoreAnswer;
  complex_server_dependencies: NoulAnswer;
  portability_priority: ScoreAnswer;
};

export type StackFitResponse = EvaluationMeta & {
  answers: StackFitAnswers;
  decision: ReturnType<typeof decideStackFit>;
};

export function decideStackFit(answers: StackFitAnswers) {
  const confidence = Math.min(
    answers.audience.confidence,
    answers.seo_need.confidence,
    answers.server_rendering_value.confidence,
    answers.portability_priority.confidence,
  );
  const reasons: string[] = [];
  let recommended: StackKey;

  if (answers.static_dominance.noul >= 0.68 && answers.seo_need.score >= 1.5) {
    recommended = "astro";
    reasons.push("公開コンテンツの静的比率が高く、必要な対話部分だけをIsland化できる");
  } else if (
    answers.audience.choice === "public_indexed" &&
    answers.seo_need.score >= 2.2 &&
    answers.server_rendering_value.score >= 2 &&
    answers.complex_server_dependencies.noul >= 0.55
  ) {
    recommended = "nextjs";
    reasons.push("公開・SEO・サーバーレンダリング・サーバー依存の条件が同時に強い");
  } else if (
    answers.server_rendering_value.score >= 1.6 &&
    answers.seo_need.score >= 1.2
  ) {
    recommended = "react_router";
    reasons.push("SSRの価値はあるが、RSCや複雑なキャッシュ戦略までは要求されていない");
  } else {
    recommended = "vite_hono";
    reasons.push("SEOとSSRの便益が小さく、対話的なSPAと薄いAPIで要件を満たせる");
  }

  if (answers.portability_priority.score >= 2) {
    reasons.push("ホスティング移植性を重視するためWeb標準APIとの相性を優先する");
  }

  return {
    recommended,
    confidence,
    reviewRequired: confidence < 0.52,
    reasons,
  };
}

export type ReleaseAnswers = {
  blast_radius: ScoreAnswer;
  critical_surface: ChoiceAnswer<"none" | "auth" | "payments" | "pii">;
  schema_change: NoulAnswer;
  rollback_quality: ScoreAnswer;
  validation_evidence: ScoreAnswer;
  release_order_dependency: NoulAnswer;
};

export type ReleaseVerdict = "safe" | "review" | "hold";
export type ReleaseResponse = EvaluationMeta & {
  answers: ReleaseAnswers;
  decision: ReturnType<typeof decideRelease>;
};

export function decideRelease(answers: ReleaseAnswers) {
  const confidence = Math.min(
    answers.blast_radius.confidence,
    answers.critical_surface.confidence,
    answers.rollback_quality.confidence,
    answers.validation_evidence.confidence,
  );
  const flags: string[] = [];
  const critical = answers.critical_surface.choice !== "none";

  if (critical) flags.push(`重要領域: ${answers.critical_surface.choice}`);
  if (answers.schema_change.noul >= 0.55) flags.push("DBスキーマ変更の可能性");
  if (answers.release_order_dependency.noul >= 0.55) flags.push("リリース順依存の可能性");
  if (answers.rollback_quality.score < 1.5) flags.push("ロールバック計画が弱い");
  if (answers.validation_evidence.score < 1.8) flags.push("検証証拠が不足");
  if (confidence < 0.55) flags.push("モデル確信度が低い");

  let verdict: ReleaseVerdict = "safe";
  if (
    (critical && answers.rollback_quality.score < 1.5) ||
    (answers.schema_change.noul >= 0.7 && answers.rollback_quality.score < 1.5)
  ) {
    verdict = "hold";
  } else if (
    flags.length > 0 ||
    answers.blast_radius.score >= 1.8
  ) {
    verdict = "review";
  }

  return { verdict, confidence, flags };
}

export type ExperimentAnswers = {
  falsifiable_hypothesis: NoulAnswer;
  metric_alignment: ScoreAnswer;
  harm_risk: ScoreAnswer;
  reversibility: ScoreAnswer;
  guardrail_present: NoulAnswer;
  sensitive_domain: ChoiceAnswer<"none" | "minors" | "health_finance" | "other_sensitive">;
};

export type ExperimentVerdict = "run" | "revise" | "review";
export type ExperimentResponse = EvaluationMeta & {
  answers: ExperimentAnswers;
  decision: ReturnType<typeof decideExperiment>;
};

export function decideExperiment(answers: ExperimentAnswers) {
  const confidence = Math.min(
    answers.metric_alignment.confidence,
    answers.harm_risk.confidence,
    answers.reversibility.confidence,
    answers.sensitive_domain.confidence,
  );
  const flags: string[] = [];
  if (answers.falsifiable_hypothesis.noul < 0.65) flags.push("仮説が検証可能な形になっていない");
  if (answers.metric_alignment.score < 1.8) flags.push("主指標と仮説の結びつきが弱い");
  if (answers.guardrail_present.noul < 0.65) flags.push("ガードレール指標が不足");
  if (answers.reversibility.score < 1.5) flags.push("停止・巻き戻しが難しい");
  if (confidence < 0.55) flags.push("モデル確信度が低い");

  let verdict: ExperimentVerdict = "run";
  if (
    answers.harm_risk.score >= 2.1 ||
    answers.sensitive_domain.choice !== "none" ||
    answers.reversibility.score < 1
  ) {
    verdict = "review";
  } else if (flags.length > 0) {
    verdict = "revise";
  }

  return { verdict, confidence, flags };
}

export type ClaimAnswers = {
  evidence_support: ScoreAnswer;
  claim_strength: ChoiceAnswer<"descriptive" | "comparative" | "absolute">;
  regulated_domain: ChoiceAnswer<"none" | "health" | "finance" | "legal">;
  omission_risk: ScoreAnswer;
  evidence_match: NoulAnswer;
};

export type ClaimVerdict = "publish" | "review" | "block";
export type ClaimResponse = EvaluationMeta & {
  answers: ClaimAnswers;
  decision: ReturnType<typeof decideClaim>;
};

export function decideClaim(answers: ClaimAnswers) {
  const confidence = Math.min(
    answers.evidence_support.confidence,
    answers.claim_strength.confidence,
    answers.regulated_domain.confidence,
    answers.omission_risk.confidence,
  );
  const flags: string[] = [];
  if (answers.evidence_support.score < 1.8) flags.push("提示された根拠による裏付けが弱い");
  if (answers.evidence_match.noul < 0.65) flags.push("コピーと根拠が十分に一致していない");
  if (answers.claim_strength.choice === "absolute") flags.push("断定的な主張を含む");
  if (answers.regulated_domain.choice !== "none") flags.push(`規制領域: ${answers.regulated_domain.choice}`);
  if (answers.omission_risk.score >= 1.8) flags.push("重要条件の省略による誤認リスク");
  if (confidence < 0.55) flags.push("モデル確信度が低い");

  let verdict: ClaimVerdict = "publish";
  if (
    answers.evidence_support.score < 0.9 ||
    answers.evidence_match.noul < 0.35 ||
    (answers.claim_strength.choice === "absolute" && answers.evidence_support.score < 1.8)
  ) {
    verdict = "block";
  } else if (flags.length > 0) {
    verdict = "review";
  }

  return { verdict, confidence, flags };
}

export type TrustAnswers = {
  category: ChoiceAnswer<"safe" | "harassment" | "self_harm" | "violence" | "scam">;
  severity: ScoreAnswer;
  targeted_person: NoulAnswer;
  imminent_risk: NoulAnswer;
  context_ambiguity: ScoreAnswer;
};

export type TrustVerdict = "allow" | "limit" | "escalate";
export type TrustResponse = EvaluationMeta & {
  answers: TrustAnswers;
  decision: ReturnType<typeof decideTrust>;
};

export function decideTrust(answers: TrustAnswers) {
  const confidence = Math.min(
    answers.category.confidence,
    answers.severity.confidence,
    answers.context_ambiguity.confidence,
  );
  const flags: string[] = [];
  if (answers.targeted_person.noul >= 0.65) flags.push("特定人物を対象としている可能性");
  if (answers.imminent_risk.noul >= 0.45) flags.push("差し迫った危険の可能性");
  if (answers.context_ambiguity.score >= 1.8) flags.push("文脈が曖昧");
  if (confidence < 0.58) flags.push("モデル確信度が低い");

  let verdict: TrustVerdict = "allow";
  if (
    answers.imminent_risk.noul >= 0.45 ||
    confidence < 0.58 ||
    (["self_harm", "violence"] as string[]).includes(answers.category.choice)
  ) {
    verdict = "escalate";
  } else if (
    answers.category.choice !== "safe" ||
    answers.severity.score >= 1.5 ||
    answers.targeted_person.noul >= 0.65
  ) {
    verdict = "limit";
  }

  return { verdict, confidence, flags };
}
