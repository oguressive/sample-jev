import type { ClaimResponse } from "@sample-jev/contracts";
import { Metric, ProbabilityBar, ResultMeta } from "@sample-jev/ui";
import { DecisionCard, DecisionWorkbench, FlagList } from "@sample-jev/ui/workbench";

type FieldKey = "copy" | "evidence" | "audience" | "channel";
const fields = [
  { key: "copy", label: "公開予定のコピー", maxLength: 3000 },
  { key: "evidence", label: "根拠・計測条件", maxLength: 3000 },
  { key: "audience", label: "対象読者", kind: "input", maxLength: 1000 },
  { key: "channel", label: "掲載場所", kind: "input", maxLength: 500 },
] as const;
const samples = [
  {
    label: "条件付き改善",
    values: {
      copy: "社内テストでは、対象タスクの完了時間を平均18%短縮しました。",
      evidence: "既存利用者42名を無作為に2群へ分け、同じ3タスクの中央値を2週間測定。改善は対象タスクに限定される。",
      audience: "業務SaaSを検討する開発チーム",
      channel: "製品サイトの導入事例",
    },
  },
  {
    label: "危険な断定",
    values: {
      copy: "必ず売上が2倍になる、業界No.1の完全自動AIです。リスクは一切ありません。",
      evidence: "顧客1社から売上が増えたと聞いた。比較条件や期間、母数は不明。",
      audience: "投資・金融サービスを運営する企業",
      channel: "SNS広告",
    },
  },
] as const;
const labels = { publish: "Publishable", review: "Human review", block: "Do not publish" } as const;

export function App() {
  return (
    <DecisionWorkbench<FieldKey, ClaimResponse>
      index="07"
      eyebrow="Claim strength / evidence gate"
      title="Claim Guard"
      description="広告文と根拠を別々に入力し、裏付け・断定性・規制領域・重要条件の省略を評価。生成や書き換えではなく、公開経路を決めます。"
      panelLabel="Copy and evidence"
      resultLabel="Publication gate"
      submitLabel="CHECK CLAIMS"
      fields={fields}
      samples={samples}
      apiBaseUrl={import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787"}
      endpoint="/v1/claim-guard/evaluate"
      placeholder="コピーと根拠の意味的な一致をJevが判断し、公開ルールはコードが所有します。"
      notice="このデモは法務判断を代替しません。入力は保存・ログ出力しません。"
      renderResult={(result) => (
        <>
          <DecisionCard eyebrow="Publication decision" title={labels[result.decision.verdict]} badge={result.decision.verdict.toUpperCase()}>
            <p>{Math.round(result.decision.confidence * 100)}% minimum confidence</p>
          </DecisionCard>
          <div className="metric-grid">
            <Metric label="Evidence" value={result.answers.evidence_support.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Omission risk" value={result.answers.omission_risk.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Claim style" value={result.answers.claim_strength.choice} />
          </div>
          <h2 className="section-title">Evidence match</h2>
          <ProbabilityBar label="Copy is supported" value={result.answers.evidence_match.noul} />
          <h2 className="section-title">Review flags</h2>
          <FlagList flags={result.decision.flags} empty="公開前レビューを必須にするシグナルはありません。" />
          <p className="policy-note">医療・金融・法務領域は内容にかかわらず専門家レビュー対象です。</p>
          <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
        </>
      )}
    />
  );
}
