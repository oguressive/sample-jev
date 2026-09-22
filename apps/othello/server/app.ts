import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { evaluationDeadlineMs } from "../src/core/evaluation.ts";
import { parseRequest, type Evaluator } from "./evaluate.ts";
import { createWarmer, type Warmer } from "./warmup.ts";

export function createApp(
  evaluate: Evaluator | null,
  allowedOrigin = "http://127.0.0.1:3011",
  warmer: Warmer = createWarmer(null),
) {
  const app = new Hono();
  let running = 0,
    used = 0,
    windowStart = Date.now();
  app.use("/api/*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    const origin = c.req.header("Origin");
    // Browser calls must originate from this local UI. No CORS wildcard or arbitrary upstream URL.
    if (origin && origin !== allowedOrigin)
      return c.json({ error: "許可されていない接続元です" }, 403);
    await next();
  });
  app.get("/api/health", (c) =>
    c.json({ ready: Boolean(evaluate), engine: "Jev", liveVerified: false }),
  );
  app.post("/api/warmup", (c) => c.json({ state: warmer.request() }));
  app.use(
    "/api/evaluate",
    bodyLimit({
      maxSize: 16_384,
      onError: (c) => c.json({ error: "入力が大きすぎます" }, 413),
    }),
  );
  app.post("/api/evaluate", async (c) => {
    if (!c.req.header("Content-Type")?.startsWith("application/json"))
      return c.json({ error: "JSONが必要です" }, 415);
    let request;
    try {
      request = parseRequest(await c.req.json());
    } catch {
      return c.json({ error: "局面またはリクエストが不正です" }, 400);
    }
    if (!evaluate)
      return c.json(
        {
          error:
            "Jev未設定です。サーバーの環境変数を設定してください。キーをブラウザーへ入力しないでください。",
        },
        503,
      );
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      used = 0;
    }
    if (running >= 2 || used >= 60) {
      c.header("Retry-After", "60");
      return c.json(
        { error: "利用上限です。少し待って再試行してください" },
        429,
      );
    }
    running++;
    used++;
    try {
      // Sending a second cold request next to a warming one would not start faster.
      await warmer.settled(c.req.raw.signal);
      const result = await evaluate(
        request,
        AbortSignal.any([
          c.req.raw.signal,
          AbortSignal.timeout(evaluationDeadlineMs(request.position)),
        ]),
      );
      if (result.meta.calls) warmer.markSuccess();
      return c.json(result);
    } catch {
      return c.json(
        {
          error:
            "Jevの評価を取得できませんでした。盤面は保存されています。再試行できます。",
        },
        502,
      );
    } finally {
      running--;
    }
  });
  app.onError((_error, c) =>
    c.json({ error: "処理に失敗しました。再試行してください" }, 500),
  );
  return app;
}
