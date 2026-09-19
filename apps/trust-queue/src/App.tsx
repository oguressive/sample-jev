import type { TrustResponse } from "@sample-jev/contracts";
import { Metric, ProbabilityBar, ResultMeta } from "@sample-jev/ui";
import { DecisionCard, DecisionWorkbench, FlagList } from "@sample-jev/ui/workbench";

type FieldKey = "content" | "context" | "policy";
const fields = [
  { key: "content", label: "投稿内容", maxLength: 4000 },
  { key: "context", label: "会話・サービス上の文脈", maxLength: 1500 },
  { key: "policy", label: "適用する簡易ポリシー", maxLength: 1500 },
] as const;
const samples = [
  {
    label: "強い意見",
    values: {
      content: "このアップデートは本当に使いづらい。前の画面に戻してほしい。",
      context: "製品アップデートへの公開コメント。特定個人への返信ではない。",
      policy: "批判や不満は許可。特定人物への脅迫、詐欺、自傷・暴力の差し迫った危険は人手確認。",
    },
  },
  {
    label: "緊急エスカレーション",
    values: {
      content: "もう限界だ。今夜、自分を傷つける準備をしている。誰にも連絡しないで。",
      context: "匿名コミュニティの新規投稿。前後の投稿履歴は確認できていない。",
      policy: "自傷や他害の可能性、具体的な時期・手段、低confidenceは削除せず人間の安全担当へ即時エスカレーション。",
    },
  },
] as const;
const labels = { allow: "Allow", limit: "Limit reach", escalate: "Escalate now" } as const;

export function App() {
  return (
    <DecisionWorkbench<FieldKey, TrustResponse>
      index="08"
      eyebrow="Safety signals / human escalation"
      title="Trust Queue"
      description="投稿を危険カテゴリ・深刻度・対象・緊急性・曖昧さへ分解。モデルの不確実性そのものを、人間へ回す条件として扱います。"
      panelLabel="Content under review"
      resultLabel="Moderation queue"
      submitLabel="TRIAGE CONTENT"
      fields={fields}
      samples={samples}
      apiBaseUrl={import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787"}
      endpoint="/v1/trust-queue/evaluate"
      placeholder="自動BAN・削除・通報は行わず、安全担当へ渡す経路だけを決めます。"
      notice="デモ用の合成入力です。実運用では専門家設計・監査・緊急対応手順が必要です。"
      renderResult={(result) => (
        <>
          <DecisionCard eyebrow="Queue decision" title={labels[result.decision.verdict]} badge={result.decision.verdict.toUpperCase()}>
            <p>{result.answers.category.choice} · {Math.round(result.decision.confidence * 100)}% minimum confidence</p>
          </DecisionCard>
          <div className="metric-grid">
            <Metric label="Severity" value={result.answers.severity.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Ambiguity" value={result.answers.context_ambiguity.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Category" value={result.answers.category.choice} />
          </div>
          <h2 className="section-title">Safety signals</h2>
          <ProbabilityBar label="Targeted person" value={result.answers.targeted_person.noul} />
          <ProbabilityBar label="Imminent risk" value={result.answers.imminent_risk.noul} />
          <h2 className="section-title">Escalation flags</h2>
          <FlagList flags={result.decision.flags} empty="追加のエスカレーション条件は検出されませんでした。" />
          <p className="policy-note">Jevの判定だけで利用者への制裁を自動実行しません。</p>
          <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
        </>
      )}
    />
  );
}
