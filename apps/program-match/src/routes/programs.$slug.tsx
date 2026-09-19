import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { PROGRAMS, type ProgramId, type ProgramResponse } from "@sample-jev/contracts";
import { ErrorBanner, Metric, Panel, ProbabilityBar, ResultMeta } from "@sample-jev/ui";

const entries = Object.entries(PROGRAMS) as Array<[ProgramId, (typeof PROGRAMS)[ProgramId]]>;
const apiBaseUrl = import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787";

export const Route = createFileRoute("/programs/$slug")({
  loader: ({ params }) => {
    const found = entries.find(([, program]) => program.slug === params.slug);
    if (!found) throw notFound();
    return { id: found[0], program: found[1] };
  },
  head: ({ loaderData }) => ({
    meta: loaderData ? [
      { title: `${loaderData.program.name} — Program Match` },
      { name: "description", content: loaderData.program.tagline },
    ] : [],
  }),
  component: ProgramDetail,
});

const sample = {
  project: "商店街の空き店舗に温湿度センサーを置き、猛暑時の休憩スポットを90日で検証する。",
  beneficiaries: "高齢者と子ども連れ。商店会と地域包括支援センターが検証に参加する。",
  evidence: "昨夏の救急搬送件数、歩行者アンケート42件、商店会3店舗の協力意向がある。",
  delivery: "第1月に共同設計、第2月に3地点へ設置、第3月に利用数と体感温度を公開評価する。",
};

function ProgramDetail() {
  const { id, program } = Route.useLoaderData();
  return <ProgramAssessment key={id} id={id} program={program} />;
}

function ProgramAssessment({ id, program }: { id: ProgramId; program: (typeof PROGRAMS)[ProgramId] }) {
  const [values, setValues] = useState(sample);
  const [result, setResult] = useState<ProgramResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);
  function update(key: keyof typeof values, value: string) {
    activeRequest.current?.abort(); activeRequest.current = null;
    setBusy(false); setError(""); setResult(null);
    setValues((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true); setError(""); setResult(null);
    try {
      const response = await fetch(`${apiBaseUrl}/v1/program-match/evaluate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ programId: id, ...values }), signal: controller.signal });
      const data = await response.json() as ProgramResponse | { error?: string };
      if (!response.ok) throw new Error("error" in data && data.error ? data.error : "判定に失敗しました。");
      if (activeRequest.current !== controller) return;
      setResult(data as ProgramResponse);
    } catch (cause) {
      if (controller.signal.aborted || activeRequest.current !== controller) return;
      setError(cause instanceof Error ? cause.message : "判定に失敗しました。");
    } finally {
      if (activeRequest.current === controller) { activeRequest.current = null; setBusy(false); }
    }
  }
  const verdicts = { strong_fit: "Strong fit", possible_fit: "Possible fit", not_fit: "Not fit", human_review: "Human review" } as const;
  return (
    <div className="workspace">
      <Panel label="SSR program brief">
        <div className="static-note"><h2>{program.name}</h2><p>{program.tagline}</p></div>
        <div className="signal-grid"><div className="signal-card"><span>Mission</span><strong>{program.mission}</strong></div><div className="signal-card"><span>Grant</span><strong>{program.grant}</strong></div></div>
        <h2 className="section-title">Eligibility</h2><p className="policy-note">{program.eligibility}</p>
      </Panel>
      <Panel label="Project fit">
        <form onSubmit={submit}>
          {(["project", "beneficiaries", "evidence", "delivery"] as const).map((key) => <label className="field" key={key}><span className="field-heading"><span>{{ project: "提案", beneficiaries: "受益者・協働先", evidence: "課題の証拠", delivery: "90日の実行計画" }[key]}</span></span><textarea className="compact-textarea" value={values[key]} onChange={(event) => update(key, event.target.value)} /></label>)}
          {error ? <ErrorBanner message={error} /> : null}
          <button className="analyze-button" type="submit" disabled={busy}><span>{busy ? "MATCHING…" : "CHECK FIT"}</span><span>↗</span></button>
        </form>
        {result ? <div style={{ marginTop: 18 }}>
          <div className="verdict"><div><small>Program decision</small><strong>{verdicts[result.decision.verdict]}</strong></div><div className="verdict-score">{Math.round(result.decision.confidence * 100)}%</div></div>
          <div className="metric-grid"><Metric label="Mission" value={result.answers.mission_match.score.toFixed(1)} suffix="/ 3" /><Metric label="Evidence" value={result.answers.evidence_strength.score.toFixed(1)} suffix="/ 3" /><Metric label="Readiness" value={result.answers.delivery_readiness.score.toFixed(1)} suffix="/ 3" /></div>
          <ProbabilityBar label="Eligibility conflict" value={result.answers.eligibility_conflict.noul} />
          {result.decision.flags.length ? <ul className="plain-list">{result.decision.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul> : null}
          <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
        </div> : null}
        <p className="privacy-note">採択を保証しません。実在の応募・送信・保存は行いません。</p>
      </Panel>
    </div>
  );
}
