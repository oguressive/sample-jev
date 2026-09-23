export type WarmupState =
  | "warm"
  | "warming"
  | "cooldown"
  | "limited"
  | "unconfigured";
export type Warmer = {
  request(): WarmupState;
  settled(signal: AbortSignal): Promise<void>;
  markSuccess(): void;
};
export function createWarmer(
  ping: (() => Promise<void>) | null,
  {
    now = Date.now,
    warmForMs = 5 * 60_000,
    failureCooldownMs = 60_000,
    maxPerHour = 12,
  } = {},
): Warmer {
  let inflight: Promise<void> | null = null,
    lastSuccess = -Infinity,
    lastFailure = -Infinity;
  const attempts: number[] = [];
  return {
    // Repeated TOP visits are only a hint; upstream calls stay bounded here.
    request() {
      if (!ping) return "unconfigured";
      if (inflight) return "warming";
      const t = now();
      if (t - lastSuccess < warmForMs) return "warm";
      if (t - lastFailure < failureCooldownMs) return "cooldown";
      while (attempts.length && t - attempts[0] >= 3_600_000) attempts.shift();
      if (attempts.length >= maxPerHour) return "limited";
      attempts.push(t);
      inflight = ping().then(
        () => {
          lastSuccess = now();
        },
        () => {
          lastFailure = now();
        },
      );
      void inflight.finally(() => {
        inflight = null;
      });
      return "warming";
    },
    async settled(signal) {
      if (!inflight) return;
      signal.throwIfAborted();
      await new Promise<void>((resolve, reject) => {
        const abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
        void inflight!.finally(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        });
      });
    },
    markSuccess() {
      lastSuccess = now();
    },
  };
}
