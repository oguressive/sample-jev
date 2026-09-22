import { validateAnalysis, type Analysis } from "./core/evaluation.ts";
import type { Difficulty } from "./core/game.ts";
import type { Position } from "./core/rules.ts";

// A generation token protects against APIs that resolve even after cancellation.
export class RequestGate {
  private generation = 0;
  private controller: AbortController | null = null;
  cancel() {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
  }
  begin() {
    this.cancel();
    const generation = this.generation;
    const controller = new AbortController();
    this.controller = controller;
    return {
      signal: controller.signal,
      current: () =>
        this.generation === generation && !controller.signal.aborted,
    };
  }
}
export async function evaluate(
  position: Position,
  revision: number,
  difficulty: Difficulty,
  mode: "move" | "hint" | "review",
  signal: AbortSignal,
): Promise<Analysis> {
  const response = await fetch("/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position, revision, difficulty, mode }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      typeof data.error === "string" ? data.error : "Jevに接続できませんでした",
    );
  return validateAnalysis(data, position, revision);
}
