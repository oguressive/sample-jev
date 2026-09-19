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

export type IncidentAnswers = {
  domain: ChoiceAnswer<"availability" | "data" | "security" | "performance">;
  urgency: ScoreAnswer;
  blast_radius: ScoreAnswer;
  customer_visible: NoulAnswer;
  evidence_quality: ScoreAnswer;
};

export type IncidentTrack = "reliability" | "data" | "security" | "performance" | "war_room";
export type IncidentResponse = EvaluationMeta & {
  answers: IncidentAnswers;
  decision: ReturnType<typeof decideIncident>;
};

const incidentSteps: Record<IncidentTrack, string[]> = {
  reliability: ["影響範囲を固定する", "直近変更と依存先を確認する", "緩和策を適用して監視する"],
  data: ["書き込み経路を保護する", "不整合の境界を特定する", "復旧前にバックアップを確保する"],
  security: ["証跡を保全する", "影響する認証情報と権限を隔離する", "セキュリティ担当へ即時連絡する"],
  performance: ["飽和している資源を特定する", "負荷と変更点を相関させる", "安全な縮退または容量追加を行う"],
  war_room: ["インシデント責任者を決める", "変更を凍結して緩和を優先する", "15分ごとに状況を更新する"],
};

export function decideIncident(answers: IncidentAnswers) {
  const confidence = Math.min(
    answers.domain.confidence,
    answers.urgency.confidence,
    answers.blast_radius.confidence,
    answers.evidence_quality.confidence,
  );
  let track: IncidentTrack = answers.domain.choice === "availability" ? "reliability" : answers.domain.choice;
  if (answers.domain.choice !== "security" && (answers.urgency.score >= 2.35 || answers.blast_radius.score >= 2.45)) {
    track = "war_room";
  }
  const flags: string[] = [];
  if (answers.customer_visible.noul >= 0.62) flags.push("顧客影響の可能性");
  if (answers.evidence_quality.score < 1.25) flags.push("観測証拠が不足");
  if (confidence < 0.58) flags.push("モデル確信度が低い");
  if (answers.domain.choice === "security") flags.push("セキュリティ事象として証跡保全を優先");

  return {
    track,
    confidence,
    pace: answers.customer_visible.noul >= 0.62 || answers.urgency.score >= 2.1 ? "immediate" as const : "standard" as const,
    humanLeadRequired: track === "war_room" || track === "security" || confidence < 0.58,
    flags,
    steps: incidentSteps[track],
  };
}

export const PROGRAMS = {
  climate_prototype: {
    slug: "climate-prototype",
    name: "Climate Prototype Fund",
    tagline: "90日で検証できる地域向け気候テック",
    mission: "地域の脱炭素または気候適応を、測定可能なプロトタイプで前進させる。",
    eligibility: "法人・任意団体。90日以内に公開検証でき、地域パートナーがいること。",
    grant: "最大300万円",
  },
  accessible_city: {
    slug: "accessible-city",
    name: "Accessible City Challenge",
    tagline: "移動・情報・参加の障壁を減らす",
    mission: "障害当事者と共同設計し、都市生活にある具体的な障壁を減らす。",
    eligibility: "当事者または支援団体との共同チーム。利用者調査の計画があること。",
    grant: "最大200万円",
  },
  local_culture: {
    slug: "local-culture",
    name: "Local Culture Commons",
    tagline: "地域文化を次世代へ開くデジタル実験",
    mission: "地域固有の文化資産を、権利に配慮しながら記録・共有・継承する。",
    eligibility: "地域団体との合意があり、成果の一部をオープンに共有できること。",
    grant: "最大150万円",
  },
} as const;

export type ProgramId = keyof typeof PROGRAMS;
export type ProgramAnswers = {
  mission_match: ScoreAnswer;
  eligibility_conflict: NoulAnswer;
  evidence_strength: ScoreAnswer;
  delivery_readiness: ScoreAnswer;
  downside_risk: ScoreAnswer;
};
export type ProgramResponse = EvaluationMeta & {
  answers: ProgramAnswers;
  decision: ReturnType<typeof decideProgramMatch>;
};

export function decideProgramMatch(answers: ProgramAnswers) {
  const confidence = Math.min(
    answers.mission_match.confidence,
    answers.evidence_strength.confidence,
    answers.delivery_readiness.confidence,
    answers.downside_risk.confidence,
  );
  const flags: string[] = [];
  if (answers.eligibility_conflict.noul >= 0.55) flags.push("応募条件との衝突可能性");
  if (answers.evidence_strength.score < 1.4) flags.push("課題・需要の証拠が弱い");
  if (answers.delivery_readiness.score < 1.4) flags.push("実行準備が不足");
  if (answers.downside_risk.score >= 2.2) flags.push("権利・安全・運用リスクが高い");
  if (confidence < 0.56) flags.push("モデル確信度が低い");

  let verdict: "strong_fit" | "possible_fit" | "not_fit" | "human_review" = "possible_fit";
  if (answers.eligibility_conflict.noul >= 0.76 || answers.mission_match.score < 0.75) {
    verdict = "not_fit";
  } else if (answers.downside_risk.score >= 2.2 || confidence < 0.56) {
    verdict = "human_review";
  } else if (
    answers.mission_match.score >= 2.2 &&
    answers.evidence_strength.score >= 1.6 &&
    answers.delivery_readiness.score >= 1.6
  ) {
    verdict = "strong_fit";
  }
  return { verdict, confidence, flags };
}

export type CanvasElement = {
  type: "Canvas" | "BriefHeader" | "MetricStrip" | "EvidencePanel" | "RiskPanel" | "ActionList" | "ActionBar";
  props: Record<string, unknown>;
  children: string[];
  on?: Record<string, { action: string; params?: Record<string, unknown> }>;
};

export type CanvasSpec = {
  root: string;
  elements: Record<string, CanvasElement>;
};

export type CanvasInput = {
  title: string;
  audience: string;
  goal: string;
  facts: string;
  metrics: string;
  risks: string;
  actions: string;
};

export type CanvasResponse = EvaluationMeta & {
  spec: CanvasSpec;
  trace: {
    stopReason: "finish" | "limit" | "unavailable";
    elapsedMs: number;
    inputTokens: number | null;
    steps: Array<{
      choice: string;
      description: string;
      parent: string | null;
      confidence: number | null;
    }>;
  };
};
