import { StrictMode, useState, type SubmitEvent } from "react";
import { createRoot } from "react-dom/client";
import {
  Link,
  Outlet,
  RouterProvider,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  useNavigate,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import type { IncidentResponse, IncidentTrack } from "@sample-jev/contracts";
import { AppShell, ErrorBanner, Metric, Panel, ProbabilityBar, ResultMeta } from "@sample-jev/ui";
import "@sample-jev/ui/styles.css";

type RouterContext = { queryClient: QueryClient };
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000, retry: false } } });
const apiBaseUrl = import.meta.env.VITE_JEV_API_URL ?? "http://localhost:8787";

const samples = {
  saturation: {
    summary: "Checkout API latency and error rate are rising",
    observed: "p95 latency rose from 420ms to 2.8s over 20 minutes. Some requests return 503.",
    impact: "Approximately 18% of checkout sessions fail in Japan. Other regions are stable.",
    telemetry: "DB CPU is 38%. Redis connection count is at 98% of the configured maximum. A cache client change deployed 35 minutes ago.",
    mitigations: "Paused the rollout at 50%. No rollback has started.",
  },
  suspicious: {
    summary: "Unexpected admin token use from a new network",
    observed: "An admin-scoped token called the export endpoint from an IP range not used by the team.",
    impact: "One workspace may have had member metadata exported. Scope is not yet confirmed.",
    telemetry: "Three successful requests followed five failed authorization attempts. Audit logs are retained.",
    mitigations: "The token was revoked and the account session was invalidated.",
  },
};
type IncidentInput = typeof samples.saturation;

const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <AppShell
      index="09"
      eyebrow="TanStack Router + Query / live operations"
      title="Incident Navigator"
      description="障害の文章を、運用ドメイン・緊急度・影響範囲・観測証拠へ分解。Jevの判断を型付きルートとコード所有のランブックに接続します。"
    >
      <Outlet />
    </AppShell>
  ),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: IncidentForm,
});

const runbookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runbook/$track",
  component: Runbook,
});

const routeTree = rootRoute.addChildren([indexRoute, runbookRoute]);
const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register { router: typeof router }
}

async function evaluateIncident(input: IncidentInput) {
  const response = await fetch(`${apiBaseUrl}/v1/incident-navigator/evaluate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await response.json() as IncidentResponse | { error?: string };
  if (!response.ok) throw new Error("error" in data && data.error ? data.error : "判定に失敗しました。");
  return data as IncidentResponse;
}

function IncidentForm() {
  const [values, setValues] = useState<IncidentInput>(samples.saturation);
  const navigate = useNavigate();
  const mutation = useMutation({
    mutationFn: evaluateIncident,
    onSuccess: (data) => {
      queryClient.setQueryData(["incident", "latest"], data);
      void navigate({ to: "/runbook/$track", params: { track: data.decision.track } });
    },
  });
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    mutation.mutate(values);
  };
  return (
    <div className="workspace">
      <Panel label="Incident packet">
        <form onSubmit={submit}>
          {([
            ["summary", "概要"], ["observed", "観測した挙動"], ["impact", "現在の影響"],
            ["telemetry", "テレメトリ・証拠"], ["mitigations", "実施済みの緩和策"],
          ] as const).map(([key, label]) => (
            <label className="field" key={key}>
              <span className="field-heading"><span>{label}</span></span>
              <textarea className="compact-textarea" value={values[key]} maxLength={2000} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))} />
            </label>
          ))}
          <div className="sample-row">
            <button className="sample-chip" type="button" onClick={() => setValues(samples.saturation)}>性能劣化</button>
            <button className="sample-chip" type="button" onClick={() => setValues(samples.suspicious)}>不審なアクセス</button>
          </div>
          {mutation.error ? <ErrorBanner message={mutation.error.message} /> : null}
          <button className="analyze-button" type="submit" disabled={mutation.isPending}>
            <span>{mutation.isPending ? "ROUTING…" : "ROUTE INCIDENT"}</span><span>→</span>
          </button>
        </form>
        <p className="privacy-note">Queryは判定結果をメモリにだけ保持します。ページ再読込後は再判定が必要です。</p>
      </Panel>
      <Panel label="Why TanStack Router">
        <div className="static-note">
          <h2>判断結果をURLへつなぐ</h2>
          <p>Jevは意味判断、Queryはサーバー状態、Routerは型付き遷移を担当します。ランブック自体はモデルに生成させず、コードで固定しています。</p>
        </div>
        <ul className="plain-list">
          <li>セキュリティ事象は常に専用ルートへ</li>
          <li>重大な非セキュリティ事象はwar roomへ</li>
          <li>低confidence時は人間のincident leadを必須化</li>
        </ul>
      </Panel>
    </div>
  );
}

const trackLabels: Record<IncidentTrack, string> = {
  reliability: "Reliability desk", data: "Data recovery", security: "Security response",
  performance: "Performance cell", war_room: "War room",
};

function Runbook() {
  const { track } = runbookRoute.useParams();
  const result = queryClient.getQueryData<IncidentResponse>(["incident", "latest"]);
  if (!result || result.decision.track !== track) {
    return <Panel label="No active assessment"><p className="policy-note">判定結果はブラウザに保存していません。</p><Link className="sample-chip" to="/">入力へ戻る</Link></Panel>;
  }
  return (
    <div className="workspace">
      <Panel label="Typed route">
        <div className="verdict"><div><small>Assigned track</small><strong>{trackLabels[track]}</strong><p>{result.decision.pace === "immediate" ? "Immediate response" : "Standard response"}</p></div><div className="verdict-score">/{track}</div></div>
        <div className="metric-grid">
          <Metric label="Urgency" value={result.answers.urgency.score.toFixed(1)} suffix="/ 3" />
          <Metric label="Blast radius" value={result.answers.blast_radius.score.toFixed(1)} suffix="/ 3" />
          <Metric label="Evidence" value={result.answers.evidence_quality.score.toFixed(1)} suffix="/ 3" />
        </div>
        <ProbabilityBar label="Customer visible" value={result.answers.customer_visible.noul} />
        <ResultMeta model={result.model} tokens={result.usage.input_tokens} />
      </Panel>
      <Panel label="Code-owned runbook">
        <ol className="plain-list">{result.decision.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        {result.decision.flags.length ? <><h2 className="section-title">Flags</h2><ul className="plain-list">{result.decision.flags.map((flag) => <li key={flag}>{flag}</li>)}</ul></> : null}
        <p className="policy-note">自動復旧・権限操作・通知送信は行いません。</p>
        <Link className="sample-chip" to="/">← 別の事象を判定</Link>
      </Panel>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider></StrictMode>,
);
