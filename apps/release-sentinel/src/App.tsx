import type { ReleaseResponse } from "@sample-jev/contracts";
import { Metric, ProbabilityBar, ResultMeta } from "@sample-jev/ui";
import { DecisionCard, DecisionWorkbench, FlagList } from "@sample-jev/ui/workbench";

type FieldKey = "change" | "affectedSystems" | "dataChanges" | "rollback" | "validation";
const fields = [
  { key: "change", label: "変更概要", maxLength: 3000 },
  { key: "affectedSystems", label: "影響するシステム・ユーザー", maxLength: 1500 },
  { key: "dataChanges", label: "DB・データ変更", maxLength: 1500 },
  { key: "rollback", label: "ロールバック方法", maxLength: 1500 },
  { key: "validation", label: "テスト・検証証拠", maxLength: 1500 },
] as const;
const samples = [
  {
    label: "低リスクUI変更",
    values: {
      change: "管理画面の空状態メッセージと余白を変更する。APIや権限判定は変更しない。",
      affectedSystems: "ログイン済み管理者だけが見る1画面。公開APIへの影響なし。",
      dataChanges: "DBスキーマ・データ更新なし。",
      rollback: "単一コミットをrevertして再デプロイできる。feature flagでも即時無効化可能。",
      validation: "コンポーネントテスト、スクリーンショット差分、stagingで主要ブラウザを確認済み。",
    },
  },
  {
    label: "決済＋Migration",
    values: {
      change: "決済完了後の状態遷移を変更し、ordersへ新しい必須カラムを追加する。",
      affectedSystems: "購入者、加盟店、返金処理、Webhook consumerに影響する。",
      dataChanges: "既存300万行をbackfill後にNOT NULL制約を追加する予定。後方互換期間は未定。",
      rollback: "アプリだけは戻せるが、Migrationとbackfillの戻し方は未定。",
      validation: "unit testは追加した。負荷試験と本番相当データでのmigration検証はまだ。",
    },
  },
] as const;
const labels = { safe: "Safe to stage", review: "Human review", hold: "Hold release" } as const;

export function App() {
  return (
    <DecisionWorkbench<FieldKey, ReleaseResponse>
      index="05"
      eyebrow="Change risk / deterministic release gate"
      title="Release Sentinel"
      description="変更説明を影響範囲・重要領域・DB変更・ロールバック・検証へ分解。Jevの判断を、明示的なリリースルールへ接続します。"
      panelLabel="Release brief"
      resultLabel="Release gate"
      submitLabel="ASSESS RELEASE"
      fields={fields}
      samples={samples}
      apiBaseUrl={import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787"}
      endpoint="/v1/release-sentinel/evaluate"
      placeholder="自動マージやデプロイは実行せず、レビュー経路だけを判定します。"
      notice="入力は保存しません。APIキーは共通Hono APIだけが保持します。"
      renderResult={(result) => (
        <>
          <DecisionCard eyebrow="Release decision" title={labels[result.decision.verdict]} badge={result.decision.verdict.toUpperCase()}>
            <p>{Math.round(result.decision.confidence * 100)}% minimum confidence</p>
          </DecisionCard>
          <div className="metric-grid">
            <Metric label="Blast radius" value={result.answers.blast_radius.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Rollback" value={result.answers.rollback_quality.score.toFixed(1)} suffix="/ 3" />
            <Metric label="Evidence" value={result.answers.validation_evidence.score.toFixed(1)} suffix="/ 3" />
          </div>
          <h2 className="section-title">Risk signals</h2>
          <ProbabilityBar label="Schema change" value={result.answers.schema_change.noul} />
          <ProbabilityBar label="Release-order dependency" value={result.answers.release_order_dependency.noul} />
          <h2 className="section-title">Policy flags</h2>
          <FlagList flags={result.decision.flags} empty="明示ルールに抵触するシグナルはありません。" />
          <p className="policy-note">これは変更説明の一次判定です。コード解析・テスト・人間の承認を代替しません。</p>
          <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
        </>
      )}
    />
  );
}
