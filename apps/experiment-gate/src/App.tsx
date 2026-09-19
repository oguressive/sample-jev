import type { ExperimentResponse } from "@sample-jev/contracts";
import { Metric, ProbabilityBar, ResultMeta } from "@sample-jev/ui";
import { DecisionCard, DecisionWorkbench, FlagList } from "@sample-jev/ui/workbench";

type FieldKey = "hypothesis" | "primaryMetric" | "audience" | "guardrails" | "rollback";
const fields = [
  { key: "hypothesis", label: "仮説", maxLength: 2000 },
  { key: "primaryMetric", label: "主指標と判定期間", maxLength: 1000 },
  { key: "audience", label: "対象ユーザー・割り当て", maxLength: 1000 },
  { key: "guardrails", label: "ガードレール・停止条件", maxLength: 1500 },
  { key: "rollback", label: "停止・巻き戻し方法", maxLength: 1200 },
] as const;
const samples = [
  {
    label: "良い実験計画",
    values: {
      hypothesis: "初回投稿までの必須入力を3項目から1項目に減らすと、登録24時間以内の初回投稿率が上がる。",
      primaryMetric: "登録24時間以内の初回投稿率。2週間、相対10%以上の改善を採用基準とする。",
      audience: "新規登録者の10%をA/Bへ無作為割り当て。未成年・既存利用者は対象外。",
      guardrails: "通報率、投稿削除率、問い合わせ率が5%以上悪化したら停止する。",
      rollback: "feature flagをOFFにすれば1分以内に全員を現行フローへ戻せる。",
    },
  },
  {
    label: "危険な施策案",
    values: {
      hypothesis: "おすすめを強くすれば売上が上がると思う。",
      primaryMetric: "売上を見る。期間や採用基準は未定。",
      audience: "全ユーザーへ一斉公開。金融商品の購入画面も対象に含む。",
      guardrails: "特になし。問題があれば考える。",
      rollback: "データ構造も同時に変更するため、公開後は簡単には戻せない。",
    },
  },
] as const;
const labels = { run: "Ready to run", revise: "Revise plan", review: "Specialist review" } as const;

export function App() {
  return (
    <DecisionWorkbench<FieldKey, ExperimentResponse>
      index="06"
      eyebrow="Falsifiability / guardrail gate"
      title="Experiment Gate"
      description="施策案を成功予測せず、検証可能性・指標整合性・ユーザーリスク・可逆性へ分解。実験開始前に直すべき条件を可視化します。"
      panelLabel="Experiment brief"
      resultLabel="Preflight report"
      submitLabel="CHECK EXPERIMENT"
      fields={fields}
      samples={samples}
      apiBaseUrl={import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787"}
      endpoint="/v1/experiment-gate/evaluate"
      placeholder="Jevは施策の成功確率ではなく、実験計画としての準備状態を判断します。"
      notice="高リスク領域や低confidenceは必ず人手確認へ送ります。"
      renderResult={(result) => (
        <>
          <DecisionCard eyebrow="Experiment decision" title={labels[result.decision.verdict]} badge={result.decision.verdict.toUpperCase()}>
            <p>{Math.round(result.decision.confidence * 100)}% minimum confidence</p>
          </DecisionCard>
          <div className="metric-grid">
            <Metric label="Metric fit" value={result.answers.metric_alignment.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Harm risk" value={result.answers.harm_risk.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Reversible" value={result.answers.reversibility.score.toFixed(1)} suffix="/ 3" />
          </div>
          <h2 className="section-title">Plan signals</h2>
          <ProbabilityBar label="Falsifiable hypothesis" value={result.answers.falsifiable_hypothesis.noul} />
          <ProbabilityBar label="Guardrail present" value={result.answers.guardrail_present.noul} />
          <h2 className="section-title">Next edits</h2>
          <FlagList flags={result.decision.flags} empty="実験開始前に必須となる修正は検出されませんでした。" />
          <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
        </>
      )}
    />
  );
}
