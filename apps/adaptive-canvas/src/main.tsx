import { StrictMode, useMemo, useState, type SubmitEvent } from "react";
import { createRoot } from "react-dom/client";
import { defineRegistry, JSONUIProvider, Renderer } from "@json-render/react";
import { canvasCatalog } from "@sample-jev/canvas-kit";
import type { CanvasInput, CanvasResponse } from "@sample-jev/contracts";
import { AppShell, ErrorBanner, Panel } from "@sample-jev/ui";
import "@sample-jev/ui/styles.css";
import "./style.css";

const sample: CanvasInput = {
  title: "City garden / weekly brief",
  audience: "地域の運営メンバー",
  goal: "次の週末に向け、リスクと実行する作業を先に見せてほしい。",
  facts: "共同菜園の参加者は増加中。新しい区画を公開し、週末の水やり当番を募集中。",
  metrics: "参加者 | 48人\n稼働区画 | 12区画\n今週の収穫 | 18kg",
  risks: "土曜日の水やり担当が未確定\n新規参加者向けの説明が必要",
  actions: "土曜日の担当を決める\n道具の使い方を共有する\n収穫会の日程を確認する",
};
const labels: Record<keyof CanvasInput, string> = { title: "タイトル", audience: "誰に見せる？", goal: "画面で何を伝えたい？", facts: "確認済みの事実", metrics: "数値（1行に ラベル | 値）", risks: "懸念（1行に1件）", actions: "次の作業（1行に1件）" };

function App() {
  const [input, setInput] = useState(sample);
  const [result, setResult] = useState<CanvasResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const { registry } = useMemo(() => defineRegistry(canvasCatalog, {
    components: {
      Canvas: ({ props, children }) => <div className={`canvas-surface layout-${props.layout} density-${props.density}`}>{children}</div>,
      BriefHeader: ({ props }) => <header className="canvas-heading"><span>{props.eyebrow}</span><h2>{props.title}</h2><p>{props.summary}</p></header>,
      MetricStrip: ({ props }) => <section className="canvas-metrics">{props.items.map((item, i) => { const [label, ...value] = item.split("|"); return <div key={i}><span>{label}</span><strong>{value.join("|") || "—"}</strong></div>; })}</section>,
      EvidencePanel: ({ props }) => <section className="canvas-tile"><h3>{props.title}</h3><p>{props.body}</p></section>,
      RiskPanel: ({ props }) => <section className={`canvas-tile canvas-risk ${props.urgent ? "urgent" : ""}`}><h3>Attention needed</h3><ul>{props.items.map((item, i) => <li key={i}>{item}</li>)}</ul></section>,
      ActionList: ({ props }) => <section className="canvas-tile"><h3>Next moves</h3><ol>{props.items.map((item, i) => <li key={i}>{item}</li>)}</ol></section>,
      ActionBar: ({ props, emit, loading }) => <div className="canvas-action"><button type="button" disabled={loading} onClick={() => emit("press")}>{props.label} ↗</button></div>,
    },
    actions: {
      review: async () => {}, share: async () => {}, investigate: async () => {},
    },
  }), []);
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setStatus("");
    const start = performance.now();
    try {
      const response = await fetch(`${import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787"}/v1/adaptive-canvas/compose`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "画面を構成できませんでした。");
      if (!canvasCatalog.validate(data.spec).success) throw new Error("画面の検証に失敗しました。");
      setResult(data); setElapsed(performance.now() - start);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "通信に失敗しました。"); }
    finally { setBusy(false); }
  }
  return <AppShell index="11" eyebrow="Generative UI / your components, composed by Jev" title="Adaptive Canvas" description="伝えたい内容と相手を入力すると、Jevが表示する部品と配置を選びます。用意した文章と数値を使って、あなたのためのブリーフを組み立てます。">
    <div className="canvas-workspace"><Panel label="Brief ingredients"><form onSubmit={submit}>{(Object.keys(labels) as Array<keyof CanvasInput>).map((key) => <label className="field" key={key}><span>{labels[key]}</span><textarea required maxLength={key === "title" ? 160 : key === "audience" ? 300 : key === "goal" ? 700 : 1500} className="compact-textarea" value={input[key]} onChange={(event) => setInput({ ...input, [key]: event.target.value })} /></label>)}{error && <ErrorBanner message={error} />}<button className="analyze-button" disabled={busy}>{busy ? "COMPOSING…" : "COMPOSE MY CANVAS"} ↗</button></form></Panel>
    <section aria-live="polite"><div className="canvas-stage-label">YOUR CANVAS {result && <span>{Math.round(elapsed)} ms · API往復（描画時間を含まない）</span>}</div>{result ? <><JSONUIProvider key={elapsed} registry={registry} handlers={{ review: () => setStatus("確認済みにしました。この画面内だけの状態です。"), share: async (params) => { try { await navigator.clipboard.writeText(String(params.title)); setStatus("タイトルをコピーしました。"); } catch { setStatus("コピーできませんでした。画面から選択してコピーしてください。"); } }, investigate: () => setStatus("調査メモ：証拠を集める → 不明点を確認する → 次の作業を決める") }}><Renderer registry={registry} spec={result.spec} loading={busy} /></JSONUIProvider>{status && <p className="static-note">{status}</p>}{result.trace.stopReason !== "finish" && <ErrorBanner message="途中までの構成です。再実行してください。" />}<details className="canvas-debug"><summary>構成結果を見る</summary><p>Jev処理：{Math.round(result.trace.elapsedMs)} ms / {result.trace.steps.length} evaluations / {result.model}</p><pre>{JSON.stringify(result.spec, null, 2)}</pre></details></> : <div className="canvas-empty"><span>＋</span><h2>Your content.<br />A different perspective.</h2><p>左側の内容から、独自のコンポーネントで画面を構成します。</p></div>}</section></div>
  </AppShell>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
