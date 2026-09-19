import "dotenv/config";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { safeErrorResponse } from "@sample-jev/jev-server";
import {
  EvaluationInputError,
  evaluateClaim,
  evaluateExperiment,
  evaluateRelease,
  evaluateStackFit,
  evaluateTrust,
} from "./evaluations.js";

const app = new Hono();
const defaultOrigins = [3003, 3004, 3005, 3006, 3007].flatMap((port) => [
  `http://localhost:${port}`,
  `http://127.0.0.1:${port}`,
]);
const allowedOrigins = new Set(
  (process.env.JEV_ALLOWED_ORIGINS ?? defaultOrigins.join(","))
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
);

app.use("*", secureHeaders());
app.use(
  "/v1/*",
  cors({
    origin: (origin) => (allowedOrigins.has(origin) ? origin : ""),
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    maxAge: 600,
  }),
);
app.use(
  "/v1/*",
  bodyLimit({
    maxSize: 32 * 1024,
    onError: (c) => c.json({ error: "Request body is too large." }, 413),
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

type Evaluator = (body: unknown) => Promise<unknown>;
function evaluationRoute(evaluator: Evaluator) {
  return async (c: { req: { json: () => Promise<unknown> }; json: (value: unknown, status?: 400) => Response }) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "A valid JSON body is required." }, 400);
    }

    try {
      return c.json(await evaluator(body));
    } catch (error) {
      if (error instanceof EvaluationInputError) {
        return c.json({ error: error.message }, 400);
      }
      return safeErrorResponse(error);
    }
  };
}

app.post("/v1/stack-fit/evaluate", evaluationRoute(evaluateStackFit));
app.post("/v1/release-sentinel/evaluate", evaluationRoute(evaluateRelease));
app.post("/v1/experiment-gate/evaluate", evaluationRoute(evaluateExperiment));
app.post("/v1/claim-guard/evaluate", evaluationRoute(evaluateClaim));
app.post("/v1/trust-queue/evaluate", evaluationRoute(evaluateTrust));

app.notFound((c) => c.json({ error: "Not found." }, 404));

const parsedPort = Number.parseInt(process.env.PORT ?? "8787", 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 8787;

serve({ fetch: app.fetch, port }, () => {
  console.log(`Jev API listening on http://localhost:${port}`);
});
