"use client";

import { FormEvent, useState } from "react";
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
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};

type ScoreAnswer = {
  type: "score";
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
};

type NoulAnswer = { type: "noul"; noul: number };

type Analysis = {
  route: string;
  rule: "human_review" | "auto_route";
  answers: {
    department: ChoiceAnswer;
    urgency: ScoreAnswer;
    refund_requested: NoulAnswer;
    tone: ChoiceAnswer;
  };
  model: string;
  usage: { input_tokens: number; output_tokens: number };
};

const samples = [
  {
    label: "機能エラー",
    value: "支払い画面でエラーになります。今日中に購入したいので確認をお願いします。",
  },
  {
    label: "返金要求",
    value: "同じ注文が二重に請求されています。重複分を返金してください。",
  },
  {
    label: "曖昧な相談",
    value: "昨日からなんとなく調子が悪い気がします。どこに相談すればよいですか？",
  },
];

const labels: Record<string, string> = {
  billing: "Billing",
  technical: "Technical",
  account: "Account",
  other: "Other",
  human_review: "Human review",
  calm: "Calm",
  concerned: "Concerned",
  angry: "Angry",
};

export default function SignalDesk() {
  const [message, setMessage] = useState(samples[0].value);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
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
      index="01"
      eyebrow="Intent routing / confidence gate"
      title="Signal Desk"
      description="一通のメッセージを、担当・緊急度・返金要求・感情の4つの独立した判断へ。文章を生成せず、次の処理に使えるシグナルだけを返します。"
    >
      <div className="workspace">
        <Panel label="Incoming message">
          <form onSubmit={analyze}>
            <Field label="問い合わせ本文" hint={`${message.length.toLocaleString()} / 6,000`}>
              <textarea
                value={message}
                maxLength={6000}
                onChange={(event) => setMessage(event.target.value)}
                aria-label="問い合わせ本文"
              />
            </Field>
            <div className="sample-row" aria-label="サンプル入力">
              {samples.map((sample) => (
                <button
                  className="sample-chip"
                  type="button"
                  key={sample.label}
                  onClick={() => setMessage(sample.value)}
                >
                  {sample.label}
                </button>
              ))}
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            <AnalyzeButton busy={busy}>ANALYZE SIGNALS</AnalyzeButton>
          </form>
          <p className="privacy-note">APIキーはサーバー内だけで使用。入力はこのデモでは保存しません。</p>
        </Panel>

        <Panel label="Structured result" className="result-panel">
          {!analysis ? (
            <ResultPlaceholder>
              実行すると、同じstateに対する4つの判断が一度に返ります。
            </ResultPlaceholder>
          ) : (
            <div aria-live="polite">
              <div className="verdict">
                <div>
                  <small>Routing decision</small>
                  <strong>{labels[analysis.route] ?? analysis.route}</strong>
                </div>
                <div className="verdict-score">
                  {analysis.rule === "human_review" ? "REVIEW" : "AUTO"}
                </div>
              </div>

              <div className="metric-grid">
                <Metric
                  label="Route confidence"
                  value={Math.round(analysis.answers.department.confidence * 100)}
                  suffix="%"
                />
                <Metric
                  label="Urgency"
                  value={analysis.answers.urgency.score.toFixed(2)}
                  suffix="/ 3"
                />
                <Metric
                  label="Refund yes"
                  value={Math.round(analysis.answers.refund_requested.noul * 100)}
                  suffix="%"
                />
              </div>

              <h2 className="section-title">Department distribution</h2>
              {Object.entries(analysis.answers.department.probabilities)
                .sort(([, a], [, b]) => b - a)
                .map(([label, value], index) => (
                  <ProbabilityBar
                    key={label}
                    label={labels[label] ?? label}
                    value={value}
                    muted={index > 0}
                  />
                ))}

              <div className="tone-line">
                <span>Dominant tone</span>
                <strong>{labels[analysis.answers.tone.choice] ?? analysis.answers.tone.choice}</strong>
                <small>{Math.round(analysis.answers.tone.confidence * 100)}% confidence</small>
              </div>
              <ResultMeta model={analysis.model} tokens={analysis.usage.input_tokens} />
            </div>
          )}
        </Panel>
      </div>
    </AppShell>
  );
}
