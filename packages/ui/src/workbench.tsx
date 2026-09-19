import { useEffect, useRef, useState, type ReactNode, type SubmitEvent } from "react";
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
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  function inputChanged(nextValues: Record<TField, string>) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setBusy(false);
    setError("");
    setResult(null);
    setValues(nextValues);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
        signal: controller.signal,
      });
      const data = await response.json() as unknown;
      const responseObject = data && typeof data === "object"
        ? data as Record<string, unknown>
        : null;
      if (!response.ok || !responseObject || !("decision" in responseObject)) {
        throw new Error(
          typeof responseObject?.error === "string"
            ? responseObject.error
            : "判定に失敗しました。",
        );
      }
      if (activeRequest.current !== controller) return;
      setResult(responseObject as TResult);
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
                    onChange={(event) => inputChanged({ ...values, [field.key]: event.target.value })}
                  />
                ) : (
                  <textarea
                    className="compact-textarea"
                    value={values[field.key]}
                    maxLength={field.maxLength}
                    onChange={(event) => inputChanged({ ...values, [field.key]: event.target.value })}
                  />
                )}
              </Field>
            ))}
            <div className="sample-row" aria-label="サンプル入力">
              {samples.map((sample) => (
                <button className="sample-chip" type="button" key={sample.label} onClick={() => inputChanged(sample.values)}>
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
