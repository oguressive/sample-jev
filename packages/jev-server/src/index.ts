import { TypeSafeClient } from "@typesafe-ai/sdk";

export class JevConfigurationError extends Error {
  constructor() {
    super("TYPESAFE_API_KEY is not configured");
    this.name = "JevConfigurationError";
  }
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
      maxRetries: 2,
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

export function safeErrorResponse(error: unknown): Response {
  if (error instanceof JevConfigurationError) {
    return Response.json(
      { error: "Jev is not configured on this server." },
      { status: 503 },
    );
  }

  return Response.json(
    { error: "Jev could not evaluate this request. Please try again." },
    { status: 502 },
  );
}
