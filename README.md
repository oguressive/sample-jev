# sample-jev

Three small TypeScript applications that use Jev for structured judgment rather than text generation.

| App | Local URL | What it demonstrates |
| --- | --- | --- |
| Signal Desk | `http://localhost:3000` | Intent routing, urgency scoring, refund detection, confidence gating |
| Issue Gate | `http://localhost:3001` | Parallel completeness checks and a code-owned readiness rule |
| Decision Arena | `http://localhost:3002` | Atomic A/B judgments recomposed with adjustable weights |

## Setup

Requirements: Node.js 20.9 or newer and a TypeSafe API key.

```bash
npm install
cp .env.example apps/signal-desk/.env.local
# Put your API key in apps/signal-desk/.env.local
npm run dev:signal
```

Repeat the `.env.local` step for whichever app you run. Use these commands for the other two applications:

```bash
npm run dev:issue
npm run dev:decision
```

Each app can also be deployed independently. Set `TYPESAFE_API_KEY` and `TYPESAFE_MODEL` in the hosting provider's server-side environment settings.

## Secret handling

- The API key is read only by server route handlers through `process.env.TYPESAFE_API_KEY`.
- There is no `NEXT_PUBLIC_` secret and no browser-side TypeSafe SDK call.
- `.env`, `.env.local`, and every `.env.*` file except `.env.example` are ignored.
- Upstream error bodies and request contents are not returned to the browser or logged.
- CI builds without an API key; the key is required only when an evaluation endpoint is called.

Before every push, run:

```bash
npm run check
git grep -nE '(tsai_[A-Za-z0-9_-]{12,}|-----BEGIN .*PRIVATE KEY-----)' -- ':!package-lock.json'
```

## Architecture

```text
browser -> Next.js route handler -> @sample-jev/jev-server -> TypeSafe API
                                      |
                                      +-> pinned model, timeout, retry, safe errors
```

Jev returns structured probabilities. The final workflow rules remain visible in application code: which cases need human review, how readiness is calculated, and how decision dimensions are weighted.

## Model and thresholds

The default model is pinned to `jev-1.13.0`. All thresholds and weights are demo policy, not universal accuracy guarantees. Evaluate them against representative data before using them for consequential actions.

## Verification

```bash
npm run typecheck
npm run build
```

## References

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- [Jev model card](https://docs.typesafe.ai/models)
