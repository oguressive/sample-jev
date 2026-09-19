import { useState, type SubmitEvent } from "react";
import type { StackFitResponse, StackKey } from "@sample-jev/contracts";
import {
  AnalyzeButton,
  ErrorBanner,
  Field,
  Metric,
  Panel,
  ProbabilityBar,
  ResultMeta,
  ResultPlaceholder,
} from "@sample-jev/ui";
import { DecisionCard, FlagList } from "@sample-jev/ui/workbench";

type FormState = {
  product: string;
  users: string;
  pages: string;
  rendering: string;
  hosting: string;
};

const samples: { label: string; values: FormState }[] = [
  {
    label: "社内管理画面",
    values: {
      product: "ログイン必須の社内オペレーター向け顧客管理画面。検索、編集、CSV出力が中心。",
      users: "社内スタッフ約80名。検索エンジンへの公開はしない。",
      pages: "一覧、詳細、編集の10画面ほど。内容はすべてユーザー・権限ごとに異なる。",
      rendering: "初回表示よりも操作後の応答性が重要。RSCや公開ページのOGPは不要。",
      hosting: "Node以外の環境にも移しやすく、APIとフロントを別々に更新したい。",
    },
  },
  {
    label: "大規模商品サイト",
    values: {
      product: "数十万件の商品ページを持つEC。カテゴリ・商品詳細・特集ページを公開する。",
      users: "不特定多数。検索流入とSNS共有が主要な集客経路。",
      pages: "商品ごとのメタデータ、在庫、価格、レコメンドを初期表示する。",
      rendering: "商品詳細のLCPと検索順位が売上へ直結。複数のサーバー専用データを合成する。",
      hosting: "運用チームはVercelを利用でき、フレームワーク依存より表示性能を優先する。",
    },
  },
  {
    label: "技術ブログ",
    values: {
      product: "Markdownの記事を公開する個人技術ブログ。問い合わせフォームだけ動的。",
      users: "検索やSNSから訪れる一般読者。ログイン機能はない。",
      pages: "記事、タグ一覧、プロフィール。記事は更新時にビルドできる。",
      rendering: "本文は完全に静的。クライアントJavaScriptは検索UIだけでよい。",
      hosting: "静的ホスティングへ安価に配置し、ランタイム依存を減らしたい。",
    },
  },
];

const stackLabels: Record<StackKey, string> = {
  nextjs: "Next.js",
  astro: "Astro",
  vite_hono: "Vite + Hono",
  react_router: "React Router SSR",
};

export function StackFitForm({ apiBaseUrl }: { apiBaseUrl: string }) {
  const [form, setForm] = useState<FormState>(samples[0].values);
  const [result, setResult] = useState<StackFitResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function update(key: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}/v1/stack-fit/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as StackFitResponse | { error?: string };
      if (!response.ok || !("decision" in data)) {
        throw new Error("error" in data && data.error ? data.error : "判定に失敗しました。");
      }
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "判定に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="workspace">
      <Panel label="Project brief">
        <form onSubmit={submit}>
          <Field label="プロダクト"><textarea className="compact-textarea" value={form.product} maxLength={2000} onChange={(e) => update("product", e.target.value)} /></Field>
          <Field label="利用者・公開範囲"><textarea className="compact-textarea" value={form.users} maxLength={1200} onChange={(e) => update("users", e.target.value)} /></Field>
          <Field label="ページ構成"><textarea className="compact-textarea" value={form.pages} maxLength={1200} onChange={(e) => update("pages", e.target.value)} /></Field>
          <Field label="レンダリング要件"><textarea className="compact-textarea" value={form.rendering} maxLength={1200} onChange={(e) => update("rendering", e.target.value)} /></Field>
          <Field label="ホスティング制約"><textarea className="compact-textarea" value={form.hosting} maxLength={1200} onChange={(e) => update("hosting", e.target.value)} /></Field>
          <div className="sample-row">
            {samples.map((sample) => <button className="sample-chip" type="button" key={sample.label} onClick={() => setForm(sample.values)}>{sample.label}</button>)}
          </div>
          {error ? <ErrorBanner message={error} /> : null}
          <AnalyzeButton busy={busy}>FIND THE FIT</AnalyzeButton>
        </form>
        <p className="privacy-note">フレームワークの人気ではなく、プロジェクトが実際に持つ条件を評価します。</p>
      </Panel>
      <Panel label="Architecture fit" className="sticky-result">
        {!result ? <ResultPlaceholder>Jevは観点を評価し、最終的な技術選定ルールはTypeScriptが所有します。</ResultPlaceholder> : (
          <div aria-live="polite">
            <DecisionCard eyebrow="Recommended default" title={stackLabels[result.decision.recommended]} badge={result.decision.reviewRequired ? "REVIEW" : "FIT"}>
              <p>{Math.round(result.decision.confidence * 100)}% minimum confidence</p>
            </DecisionCard>
            <div className="metric-grid">
              <Metric label="SEO need" value={result.answers.seo_need.score.toFixed(1)} suffix="/ 3" />
              <Metric label="SSR value" value={result.answers.server_rendering_value.score.toFixed(1)} suffix="/ 3" />
              <Metric label="Portability" value={result.answers.portability_priority.score.toFixed(1)} suffix="/ 3" />
            </div>
            <h2 className="section-title">Architecture signals</h2>
            <ProbabilityBar label="Static-content dominant" value={result.answers.static_dominance.noul} />
            <ProbabilityBar label="Complex server dependencies" value={result.answers.complex_server_dependencies.noul} />
            <h2 className="section-title">Why this default</h2>
            <FlagList flags={result.decision.reasons} empty="追加理由はありません。" />
            <p className="policy-note">これは初期構成の推奨であり、チーム経験・運用基盤・実測結果で再評価してください。</p>
            <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
          </div>
        )}
      </Panel>
    </div>
  );
}
