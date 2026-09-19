"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  AnalyzeButton,
  AppShell,
  ErrorBanner,
  Field,
  Panel,
  ResultMeta,
  ResultPlaceholder,
} from "@sample-jev/ui";

const dimensions = [
  { key: "goal_fit", label: "Goal fit", initial: 3 },
  { key: "time_to_value", label: "Time to value", initial: 2 },
  { key: "reversibility", label: "Reversibility", initial: 1.5 },
  { key: "user_impact", label: "User impact", initial: 3 },
  { key: "operational_simplicity", label: "Operational simplicity", initial: 1 },
  { key: "downside_risk", label: "Lower downside risk", initial: 2.5 },
] as const;

type DimensionKey = (typeof dimensions)[number]["key"];
type ChoiceAnswer = {
  choice: "a" | "b" | "tie";
  confidence: number;
  probabilities: { a: number; b: number; tie: number };
};
type Analysis = {
  answers: Record<DimensionKey, ChoiceAnswer>;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

const sample = {
  goal: "Jevの価値を初見のエンジニアに3分で理解してもらい、SNSで共有されるデモを作る。",
  optionA: "問い合わせ文を担当部署・緊急度・返金要求に分解し、判断確率をリアルタイム表示する。",
  optionB: "ユーザーが自由に質問を書き、Jevの回答値をJSONとしてそのまま表示する汎用Playgroundを作る。",
  constraints: "2日でMVP。個人開発。説明なしでも操作できること。APIキーはサーバーだけに置く。",
};

const alternate = {
  goal: "チームのPRレビュー待ち時間を減らしながら、本番事故率を上げない。",
  optionA: "低リスクPRだけAIレビュー後に自動マージする。リスク分類とconfidenceに閾値を置く。",
  optionB: "すべてのPRを同じ優先度で人間の当番に割り当て、レビュー期限の通知を増やす。",
  constraints: "認証・決済・DB変更は必ず人間が確認。1か月で段階導入できること。",
};

export default function DecisionArena() {
  const [form, setForm] = useState(sample);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [weights, setWeights] = useState<Record<DimensionKey, number>>(
    Object.fromEntries(dimensions.map((item) => [item.key, item.initial])) as Record<DimensionKey, number>,
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const decision = useMemo(() => {
    if (!analysis) return null;
    const totalWeight = dimensions.reduce((sum, item) => sum + weights[item.key], 0);
    const raw = dimensions.reduce((sum, item) => {
      const probability = analysis.answers[item.key].probabilities;
      return sum + (probability.a - probability.b) * weights[item.key];
    }, 0);
    const shareA = totalWeight ? Math.min(1, Math.max(0, (raw / totalWeight + 1) / 2)) : 0.5;
    const threshold = totalWeight * 0.04;
    return {
      winner: Math.abs(raw) <= threshold ? "tie" : raw > 0 ? "a" : "b",
      shareA,
      shareB: 1 - shareA,
    } as const;
  }, [analysis, weights]);

  function update(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as Analysis | { error?: string };
      if (!response.ok || !("answers" in data)) {
        throw new Error("error" in data ? data.error : "判定に失敗しました。");
      }
      setAnalysis(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "判定に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      index="03"
      eyebrow="Atomic judgments / adjustable composition"
      title="Decision Arena"
      description="AかBかを一発で聞かず、目的適合・速さ・可逆性・利用者価値・運用・下振れリスクへ分解。Jevは一度だけ呼び、重みの変更は返却済み確率から即座に再計算します。"
    >
      <div className="arena-stack">
        <Panel label="Decision brief">
          <form onSubmit={analyze}>
            <Field label="達成したい目的">
              <textarea className="short-textarea" value={form.goal} maxLength={1500} onChange={(e) => update("goal", e.target.value)} />
            </Field>
            <div className="option-grid">
              <Field label="Option A">
                <textarea value={form.optionA} maxLength={3000} onChange={(e) => update("optionA", e.target.value)} />
              </Field>
              <Field label="Option B">
                <textarea value={form.optionB} maxLength={3000} onChange={(e) => update("optionB", e.target.value)} />
              </Field>
            </div>
            <Field label="制約・前提">
              <textarea className="short-textarea" value={form.constraints} maxLength={2000} onChange={(e) => update("constraints", e.target.value)} />
            </Field>
            <div className="sample-row">
              <button className="sample-chip" type="button" onClick={() => setForm(sample)}>デモ企画</button>
              <button className="sample-chip" type="button" onClick={() => setForm(alternate)}>PR運用</button>
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            <AnalyzeButton busy={busy}>RUN SIX JUDGMENTS</AnalyzeButton>
          </form>
        </Panel>

        <Panel label="Weighted decision">
          {!analysis || !decision ? (
            <ResultPlaceholder>
              6つの質問は同じstateに対して並列・独立に評価されます。
            </ResultPlaceholder>
          ) : (
            <div aria-live="polite">
              <div className="arena-verdict">
                <div className={`contestant ${decision.winner === "a" ? "winner" : ""}`}>
                  <small>Option A</small>
                  <strong>{Math.round(decision.shareA * 100)}</strong><span>%</span>
                </div>
                <div className="versus">{decision.winner === "tie" ? "TIE" : "VS"}</div>
                <div className={`contestant b ${decision.winner === "b" ? "winner" : ""}`}>
                  <small>Option B</small>
                  <strong>{Math.round(decision.shareB * 100)}</strong><span>%</span>
                </div>
              </div>
              <div className="duel-track">
                <div style={{ width: `${decision.shareA * 100}%` }} />
              </div>
              <p className="policy-note">表示比率は各観点のA/B確率差 × 重みから算出した比較指標です。成功確率ではありません。</p>

              <h2 className="section-title">Tune the policy — API callなしで再計算</h2>
              <div className="dimension-list">
                {dimensions.map((dimension) => {
                  const answer = analysis.answers[dimension.key];
                  return (
                    <div className="dimension" key={dimension.key}>
                      <div className="dimension-head">
                        <strong>{dimension.label}</strong>
                        <span className={`pick ${answer.choice}`}>{answer.choice.toUpperCase()}</span>
                        <small>{Math.round(answer.confidence * 100)}% conf.</small>
                      </div>
                      <div className="mini-duel">
                        <span style={{ width: `${answer.probabilities.a * 100}%` }} />
                        <i style={{ width: `${answer.probabilities.tie * 100}%` }} />
                        <b style={{ width: `${answer.probabilities.b * 100}%` }} />
                      </div>
                      <label className="weight">
                        <span>weight</span>
                        <input
                          type="range"
                          min="0"
                          max="5"
                          step="0.5"
                          value={weights[dimension.key]}
                          onChange={(event) => setWeights((current) => ({ ...current, [dimension.key]: Number(event.target.value) }))}
                        />
                        <output>{weights[dimension.key].toFixed(1)}</output>
                      </label>
                    </div>
                  );
                })}
              </div>
              <ResultMeta model={analysis.model} tokens={analysis.usage.input_tokens} />
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
