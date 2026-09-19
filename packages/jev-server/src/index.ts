import {
  APITimeoutError,
  APIUserAbortError,
  RateLimitError,
  TypeSafeClient,
} from "@typesafe-ai/sdk";

export class JevConfigurationError extends Error {
  constructor() {
    super("TYPESAFE_API_KEY is not configured");
    this.name = "JevConfigurationError";
  }
}

export class JevInputError extends Error {
  constructor(message = "A valid JSON object is required.") {
    super(message);
    this.name = "JevInputError";
  }
}

export class JevPayloadTooLargeError extends Error {
  constructor() {
    super("Request body is too large.");
    this.name = "JevPayloadTooLargeError";
  }
}

export class JevAnswerValidationError extends Error {
  constructor() {
    super("Jev returned an invalid answer payload");
    this.name = "JevAnswerValidationError";
  }
}

type AnswerShape =
  | { type: "choice"; choices: readonly string[] }
  | { type: "score"; minimum?: number; maximum?: number }
  | { type: "noul" };

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function boundedNumber(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function validProbabilities(value: unknown): boolean {
  const probabilities = recordValue(value);
  return probabilities !== null &&
    Object.values(probabilities).every((probability) => boundedNumber(probability, 0, 1));
}

export function validateSystemAnswers<T>(
  value: unknown,
  shapes: Record<string, AnswerShape>,
): T {
  const answers = recordValue(value);
  if (!answers) throw new JevAnswerValidationError();

  for (const [key, shape] of Object.entries(shapes)) {
    const answer = recordValue(answers[key]);
    if (!answer) throw new JevAnswerValidationError();

    if (shape.type === "noul") {
      if (!boundedNumber(answer.noul, 0, 1)) throw new JevAnswerValidationError();
      continue;
    }

    if (
      !boundedNumber(answer.confidence, 0, 1) ||
      !validProbabilities(answer.probabilities)
    ) {
      throw new JevAnswerValidationError();
    }

    if (shape.type === "choice") {
      if (typeof answer.choice !== "string" || !shape.choices.includes(answer.choice)) {
        throw new JevAnswerValidationError();
      }
    } else if (!boundedNumber(answer.score, shape.minimum ?? 0, shape.maximum ?? 3)) {
      throw new JevAnswerValidationError();
    }
  }

  return answers as T;
}

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
};

export function createFixedWindowRateLimiter({
  limit,
  windowMs,
  now = Date.now,
}: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const buckets = new Map<string, { count: number; startedAt: number }>();

  return (key: string): RateLimitDecision => {
    const currentTime = now();
    const existing = buckets.get(key);
    const bucket = !existing || currentTime - existing.startedAt >= windowMs
      ? { count: 0, startedAt: currentTime }
      : existing;

    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [bucketKey, candidate] of buckets) {
        if (currentTime - candidate.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }

    return {
      allowed: bucket.count <= limit,
      limit,
      remaining: Math.max(0, limit - bucket.count),
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((bucket.startedAt + windowMs - currentTime) / 1_000),
      ),
    };
  };
}

export function createRequestRateLimiter({
  limit,
  windowMs = 60_000,
  trustProxy = false,
}: {
  limit: number;
  windowMs?: number;
  trustProxy?: boolean;
}) {
  const take = createFixedWindowRateLimiter({ limit, windowMs });

  return (request: Request): Response | null => {
    const forwardedAddress = trustProxy
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : null;
    const decision = take(forwardedAddress || "global");
    if (decision.allowed) return null;

    return Response.json(
      { error: "Too many evaluation requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(decision.retryAfterSeconds),
          "RateLimit-Limit": String(decision.limit),
          "RateLimit-Remaining": String(decision.remaining),
        },
      },
    );
  };
}

export function createJevClient(): TypeSafeClient {
  const apiKey = process.env.TYPESAFE_API_KEY?.trim();

  if (!apiKey) {
    throw new JevConfigurationError();
  }

  return new TypeSafeClient({
    apiKey,
    defaultModel: process.env.TYPESAFE_MODEL?.trim() || "jev-1.13.0",
    timeout: 8_000,
    retry: {
      maxRetries: 1,
      backoffInitialMs: 400,
      backoffMaxMs: 2_000,
    },
    logLevel: "off",
  });
}

export function requestDeadline(milliseconds = 15_000): AbortSignal {
  return AbortSignal.timeout(milliseconds);
}

export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\u0000/g, "").slice(0, maxLength);
}

async function readTextBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new JevPayloadTooLargeError();
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new JevPayloadTooLargeError();
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export async function readJsonObject(
  request: Request,
  maxBytes = 32 * 1024,
): Promise<Record<string, unknown>> {
  let value: unknown;
  try {
    value = JSON.parse((await readTextBody(request, maxBytes)).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error instanceof JevPayloadTooLargeError) throw error;
    throw new JevInputError();
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new JevInputError();
  }
  return value as Record<string, unknown>;
}

export function safeErrorResponse(error: unknown): Response {
  if (error instanceof JevPayloadTooLargeError) {
    return Response.json({ error: error.message }, { status: 413 });
  }

  if (error instanceof JevInputError) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  if (error instanceof JevConfigurationError) {
    return Response.json(
      { error: "Jev is not configured on this server." },
      { status: 503 },
    );
  }

  if (error instanceof RateLimitError) {
    return Response.json(
      { error: "The evaluation service is busy. Please try again later." },
      { status: 429 },
    );
  }

  if (error instanceof APITimeoutError || error instanceof APIUserAbortError) {
    return Response.json(
      { error: "The evaluation service timed out. Please try again." },
      { status: 504 },
    );
  }

  return Response.json(
    { error: "Jev could not evaluate this request. Please try again." },
    { status: 502 },
  );
}
