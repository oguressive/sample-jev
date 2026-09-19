import type { ReactNode } from "react";

export type NavApp = {
  label: string;
  href: string;
  port: string;
};

const apps: NavApp[] = [
  { label: "Signal Desk", href: "http://localhost:3000", port: "3000" },
  { label: "Issue Gate", href: "http://localhost:3001", port: "3001" },
  { label: "Decision Arena", href: "http://localhost:3002", port: "3002" },
];

export function AppShell({
  index,
  eyebrow,
  title,
  description,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="shell">
      <nav className="topbar" aria-label="Jev demos">
        <a className="brand" href="https://github.com/oguressive/sample-jev">
          <span className="brand-mark" aria-hidden="true">J</span>
          <span>Jev / field notes</span>
        </a>
        <div className="app-switcher">
          {apps.map((app, itemIndex) => (
            <a
              className={String(itemIndex + 1).padStart(2, "0") === index ? "active" : ""}
              href={app.href}
              key={app.port}
              title={`Local port ${app.port}`}
            >
              {String(itemIndex + 1).padStart(2, "0")}
            </a>
          ))}
        </div>
      </nav>

      <header className="hero">
        <div className="hero-index">{index}</div>
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="lede">{description}</p>
        </div>
      </header>

      {children}

      <footer>
        <span>Structured judgment, composed in code.</span>
        <span>jev-1.13.0 · server-side only</span>
      </footer>
    </main>
  );
}

export function Panel({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-label"><span>{label}</span></div>
      {children}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-heading">
        <span>{label}</span>
        {hint ? <small>{hint}</small> : null}
      </span>
      {children}
    </label>
  );
}

export function AnalyzeButton({ busy, children }: { busy: boolean; children: ReactNode }) {
  return (
    <button className="analyze-button" type="submit" disabled={busy}>
      <span>{busy ? "JUDGING…" : children}</span>
      <span aria-hidden="true">↗</span>
    </button>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return <div className="error-banner" role="alert">{message}</div>;
}

export function ProbabilityBar({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number;
  muted?: boolean;
}) {
  const safeValue = Math.min(1, Math.max(0, value));
  return (
    <div className={`probability ${muted ? "muted" : ""}`}>
      <div className="probability-copy">
        <span>{label}</span>
        <strong>{Math.round(safeValue * 100)}%</strong>
      </div>
      <div className="track" aria-hidden="true">
        <div className="fill" style={{ width: `${safeValue * 100}%` }} />
      </div>
    </div>
  );
}

export function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: string | number;
  suffix?: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}{suffix ? <small>{suffix}</small> : null}</strong>
    </div>
  );
}

export function ResultPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="result-placeholder">
      <div className="pulse" />
      <p>{children}</p>
    </div>
  );
}

export function ResultMeta({ model, tokens }: { model: string; tokens: number }) {
  return (
    <div className="result-meta">
      <span>{model}</span>
      <span>{tokens.toLocaleString()} input tokens</span>
    </div>
  );
}
