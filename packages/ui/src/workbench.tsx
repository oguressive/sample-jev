import { useState, type ReactNode, type SubmitEvent } from "react";
import {
  AnalyzeButton,
  AppShell,
  ErrorBanner,
  Field,
  Panel,
  ResultPlaceholder,
} from "./index";

export type WorkbenchField<T extends string> = {
  key: T;
  label: string;
  kind?: "input" | "textarea";
  maxLength: number;
  hint?: string;
};

export type WorkbenchSample<T extends string> = {
  label: string;
  values: Record<T, string>;
};

export function DecisionWorkbench<TField extends string, TResult extends object>({
  index,
  eyebrow,
  title,
  description,
  panelLabel,
  resultLabel,
  submitLabel,
  fields,
  samples,
  apiBaseUrl,
  endpoint,
  placeholder,
  notice,
  renderResult,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  panelLabel: string;
  resultLabel: string;
  submitLabel: string;
  fields: readonly WorkbenchField<TField>[];
  samples: readonly WorkbenchSample<TField>[];
  apiBaseUrl: string;
  endpoint: string;
  placeholder: string;
  notice: string;
  renderResult: (result: TResult) => ReactNode;
}) {
  const [values, setValues] = useState<Record<TField, string>>(samples[0].values);
  const [result, setResult] = useState<TResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json()) as TResult | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "判定に失敗しました。");
      }
      setResult(data as TResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "判定に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell index={index} eyebrow={eyebrow} title={title} description={description}>
      <div className="workspace">
        <Panel label={panelLabel}>
          <form onSubmit={submit}>
            {fields.map((field) => (
              <Field label={field.label} hint={field.hint} key={field.key}>
                {field.kind === "input" ? (
                  <input
                    type="text"
                    value={values[field.key]}
                    maxLength={field.maxLength}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                ) : (
                  <textarea
                    className="compact-textarea"
                    value={values[field.key]}
                    maxLength={field.maxLength}
                    onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                  />
                )}
              </Field>
            ))}
            <div className="sample-row" aria-label="サンプル入力">
              {samples.map((sample) => (
                <button className="sample-chip" type="button" key={sample.label} onClick={() => setValues(sample.values)}>
                  {sample.label}
                </button>
              ))}
            </div>
            {error ? <ErrorBanner message={error} /> : null}
            <AnalyzeButton busy={busy}>{submitLabel}</AnalyzeButton>
          </form>
          <p className="privacy-note">{notice}</p>
        </Panel>
        <Panel label={resultLabel} className="sticky-result">
          {result ? <div aria-live="polite">{renderResult(result)}</div> : <ResultPlaceholder>{placeholder}</ResultPlaceholder>}
        </Panel>
      </div>
    </AppShell>
  );
}

export function DecisionCard({
  eyebrow,
  title,
  badge,
  children,
}: {
  eyebrow: string;
  title: string;
  badge: string;
  children?: ReactNode;
}) {
  return (
    <div className="verdict">
      <div>
        <small>{eyebrow}</small>
        <strong>{title}</strong>
        {children}
      </div>
      <div className="verdict-score">{badge}</div>
    </div>
  );
}

export function FlagList({ flags, empty }: { flags: string[]; empty: string }) {
  return flags.length ? (
    <ul className="plain-list">{flags.map((flag) => <li key={flag}>{flag}</li>)}</ul>
  ) : (
    <div className="all-clear">{empty}</div>
  );
}
