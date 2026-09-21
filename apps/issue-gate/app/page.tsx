"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  AnalyzeButton,
  AppShell,
  ErrorBanner,
  Field,
  Metric,
  Panel,
  ProbabilityBar,
  ResultMeta,
  ResultPlaceholder,
} from "@sample-jev/ui";

type ChoiceAnswer = {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
type ScoreAnswer = { score: number; confidence: number };
type NoulAnswer = { noul: number };
type Analysis = {
  verdict: "ready" | "needs_context";
  readiness: number;
  missing: string[];
  answers: {
    category: ChoiceAnswer;
    reproducibility: ScoreAnswer;
    expected_present: NoulAnswer;
    actual_present: NoulAnswer;
    sufficient_context: NoulAnswer;
    impact: ScoreAnswer;
  };
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

const completeSample = {
  title: "SafariでPDFエクスポートすると設定画面がクラッシュする",
  environment: "macOS 15.6 / Safari 19.0 / production / 権限: editor",
  steps: "1. 設定画面を開く\n2. エクスポートを選ぶ\n3. 形式をPDFにする\n4. 実行ボタンを押す",
  expected: "PDFがダウンロードされ、設定画面を操作し続けられる。",
  actual: "実行直後に設定画面が白くなり操作不能になる。Chromeでは再現せず、Safariでは3回中3回再現する。",
};

const vagueSample = {
  title: "エクスポートできない",
  environment: "本番",
  steps: "ボタンを押した",
  expected: "",
  actual: "動かなかった気がします。",
};

const categoryLabels: Record<string, string> = {
  bug: "Bug",
  feature: "Feature",
  question: "Question",
  other: "Other",
};

export default function IssueGate() {
  const [form, setForm] = useState(completeSample);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function changeForm(nextForm: typeof form) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
    setError("");
    setAnalysis(null);
    setForm(nextForm);
  }

  function update(key: keyof typeof form, value: string) {
    changeForm({ ...form, [key]: value });
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError("");
    setAnalysis(null);
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
        signal: controller.signal,
      });
      const data = (await response.json()) as Analysis | { error?: string };
      if (!response.ok || !("answers" in data)) {
        throw new Error("error" in data ? data.error : "判定に失敗しました。");
      }
      if (activeRequest.current !== controller) return;
      setAnalysis(data);
    } catch (cause) {
      if (controller.signal.aborted || activeRequest.current !== controller) return;
      setError(cause instanceof Error ? cause.message : "判定に失敗しました。");
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <AppShell
      index="02"
      eyebrow="Parallel checks / code-owned policy"
      title="Issue Gate"
      description="Issueをひとつの総合点で雑に評価せず、再現性・期待値・実際の結果・調査可能性を別々に判定。不足項目は確率と明示的なルールから組み立てます。"
    >
      <div className="workspace issue-workspace">
        <Panel label="Issue draft">
          <form onSubmit={analyze}>
            <Field label="タイトル">
              <input value={form.title} maxLength={300} onChange={(e) => update("title", e.target.value)} />
            </Field>
            <Field label="環境">
              <input value={form.environment} maxLength={1000} onChange={(e) => update("environment", e.target.value)} />
            </Field>
            <Field label="再現手順">
              <textarea className="compact-textarea" value={form.steps} maxLength={4000} onChange={(e) => update("steps", e.target.value)} />
            </Field>
            <div className="two-fields">
              <Field label="期待した結果">
                <textarea className="compact-textarea" value={form.expected} maxLength={2000} onChange={(e) => update("expected", e.target.value)} />
              </Field>
              <Field label="実際の結果">
                <textarea className="compact-textarea" value={form.actual} maxLength={3000} onChange={(e) => update("actual", e.target.value)} />
              </Field>
            </div>
            <div className="sample-row">
              <button className="sample-chip" type="button" onClick={() => changeForm(completeSample)}>具体的なIssue</button>
              <button className="sample-chip" type="button" onClick={() => changeForm(vagueSample)}>曖昧なIssue</button>
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            <AnalyzeButton busy={busy}>CHECK READINESS</AnalyzeButton>
          </form>
        </Panel>

        <Panel label="Readiness report" className="sticky-result">
          {!analysis ? (
            <ResultPlaceholder>
              判定後も、採用基準と不足項目はアプリケーションコードが所有します。
            </ResultPlaceholder>
          ) : (
            <div aria-live="polite">
              <div className={`gate ${analysis.verdict}`}>
                <div className="gate-ring" style={{ "--score": `${analysis.readiness * 360}deg` } as React.CSSProperties}>
                  <span>{Math.round(analysis.readiness * 100)}</span><small>%</small>
                </div>
                <div>
                  <small>Engineering gate</small>
                  <strong>{analysis.verdict === "ready" ? "Ready to inspect" : "Needs context"}</strong>
                  <p>{categoryLabels[analysis.answers.category.choice]} · {Math.round(analysis.answers.category.confidence * 100)}% confidence</p>
                </div>
              </div>

              <div className="metric-grid">
                <Metric label="Reproducibility" value={analysis.answers.reproducibility.score.toFixed(2)} suffix="/ 3" />
                <Metric label="User impact" value={analysis.answers.impact.score.toFixed(2)} suffix="/ 3" />
                <Metric label="Context yes" value={Math.round(analysis.answers.sufficient_context.noul * 100)} suffix="%" />
              </div>

              <h2 className="section-title">Evidence signals</h2>
              <ProbabilityBar label="Expected behavior is clear" value={analysis.answers.expected_present.noul} />
              <ProbabilityBar label="Actual behavior is clear" value={analysis.answers.actual_present.noul} />
              <ProbabilityBar label="Enough context to start" value={analysis.answers.sufficient_context.noul} />

              <h2 className="section-title">Next edits</h2>
              {analysis.missing.length ? (
                <ul className="plain-list">{analysis.missing.map((item) => <li key={item}>{item}</li>)}</ul>
              ) : (
                <div className="all-clear">必須の追加情報は検出されませんでした。</div>
              )}
              <ResultMeta model={analysis.model} tokens={analysis.usage.input_tokens} />
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
