import { serve } from "@hono/node-server";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { createApp } from "./app.ts";
import { makeEvaluator, makeWarmupPing } from "./evaluate.ts";
import { createWarmer } from "./warmup.ts";

const key = process.env.TYPESAFE_API_KEY?.trim();
const client = key
  ? new TypeSafeClient({
      apiKey: key,
      baseURL: "https://api.typesafe.ai",
      defaultModel: process.env.TYPESAFE_DEFAULT_MODEL || "jev-latest",
      logLevel: "off",
      retry: { maxRetries: 0 },
    })
  : null;
const evaluator = client ? makeEvaluator(client) : null;
const warmer = createWarmer(client ? makeWarmupPing(client) : null);
const port = Number(process.env.OTHELLO_PORT || 8788);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Invalid OTHELLO_PORT");
serve({
  fetch: createApp(evaluator, process.env.OTHELLO_ALLOWED_ORIGIN, warmer).fetch,
  hostname: "127.0.0.1",
  port,
});
console.info(
  `Othello API listening on loopback port ${port}; Jev ${evaluator ? "configured" : "not configured"}.`,
);
