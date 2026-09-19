# sample-jev

Eleven small TypeScript applications that use Jev for structured judgment and catalog-constrained UI composition.

## Applications

| # | App | Local URL | Stack | What it demonstrates |
| --- | --- | --- | --- | --- |
| 01 | Signal Desk | `http://localhost:3000` | Next.js | Intent routing, urgency scoring, refund detection, confidence gating |
| 02 | Issue Gate | `http://localhost:3001` | Next.js | Parallel completeness checks and a code-owned readiness rule |
| 03 | Decision Arena | `http://localhost:3002` | Next.js | Atomic A/B judgments recomposed with adjustable weights |
| 04 | Stack Fit | `http://localhost:3003` | Astro + React island | Framework selection from explicit product constraints |
| 05 | Release Sentinel | `http://localhost:3004` | Vite + React | Release-risk triage without triggering a deployment |
| 06 | Experiment Gate | `http://localhost:3005` | Vite + React | Experiment preflight for falsifiability, guardrails, and harm risk |
| 07 | Claim Guard | `http://localhost:3006` | Vite + React | Evidence-aware publication routing for marketing claims |
| 08 | Trust Queue | `http://localhost:3007` | Vite + React | Safety triage with mandatory human escalation paths |
| 09 | Incident Navigator | `http://localhost:3008` | TanStack Router + Query | Operational triage routed to a code-owned runbook |
| 10 | Program Match | `http://localhost:3009` | TanStack Start | SSR program directory with project-fit evaluation |
| 11 | Adaptive Canvas | `http://localhost:3010` | json-render + React | Jev selects component candidates and their order |

The eight non-Next.js applications use a shared Hono API on `http://localhost:8787`.

## Why multiple frameworks?

The repository intentionally does not make Next.js the default for every interface.

- The original three apps remain compact Next.js reference implementations.
- Stack Fit has a public, static explanation surface, so Astro emits the shell as HTML and hydrates only the decision form.
- Release Sentinel, Experiment Gate, Claim Guard, and Trust Queue are single-screen interactive tools with no SEO requirement, so Vite SPAs avoid server/client component and cache-management overhead.
- Hono keeps the secret-bearing API separate and uses web-standard `Request`/`Response` primitives.

This is a project-specific application of [“Does your project really need Next.js?”](https://ashunar0.dev/posts/does-your-project-need-nextjs/), not a claim that one framework is universally better.

## Setup

Requirements: Node.js 22.12 or newer and a TypeSafe API key for live judgments.

```bash
npm install
cp .env.example apps/jev-api/.env
# Put your real TYPESAFE_API_KEY only in apps/jev-api/.env.
```

Start the shared API in one terminal:

```bash
npm run dev:api
```

Then start one frontend in another terminal:

```bash
npm run dev:stack
npm run dev:release
npm run dev:experiment
npm run dev:claim
npm run dev:trust
npm run dev:incident
npm run dev:program
npm run dev:canvas
```

The original Next.js apps remain independently runnable:

```bash
cp .env.example apps/signal-desk/.env.local
npm run dev:signal
npm run dev:issue
npm run dev:decision
```

## Architecture

```text
Astro / Vite frontends -> Hono API -> @sample-jev/jev-server -> TypeSafe API
                               |
                               +-> fixed questions -> probabilities -> pure policy functions
```

The browser never provides Jev question definitions. Evaluation routes own fixed atomic questions; the canvas route lets the official composer construct questions from server-owned candidate definitions. Jev returns structured probabilities and confidence; pure TypeScript functions own the final thresholds, flags, and workflow verdicts.

## Secret handling

- `TYPESAFE_API_KEY` is read only by server-side code through `process.env.TYPESAFE_API_KEY`.
- No `VITE_`, `PUBLIC_`, or `NEXT_PUBLIC_` variable contains a credential.
- `.env`, `.env.local`, and every `.env.*` file except `.env.example` are ignored.
- Inputs, credentials, and upstream error bodies are not logged or returned to the browser.
- The API accepts only fixed evaluation routes and enforces request-size and field-length limits.
- CI builds and policy tests require no API key; a key is required only for a live evaluation call.

## API routes

| Method | Route |
| --- | --- |
| `GET` | `/health` |
| `POST` | `/v1/stack-fit/evaluate` |
| `POST` | `/v1/release-sentinel/evaluate` |
| `POST` | `/v1/experiment-gate/evaluate` |
| `POST` | `/v1/claim-guard/evaluate` |
| `POST` | `/v1/trust-queue/evaluate` |
| `POST` | `/v1/incident-navigator/evaluate` |
| `POST` | `/v1/program-match/evaluate` |
| `POST` | `/v1/adaptive-canvas/compose` |

## TanStack and Generative UI examples

Incident Navigator uses TanStack Router for typed navigation and TanStack Query for the evaluation mutation. Its last result stays only in the current browser session's memory. Direct runbook links without a matching assessment lead back to the input form. No incident remediation is executed.

Program Match uses TanStack Start to SSR the public directory and `/programs/$slug` detail pages, including per-program metadata and a not-found route. Program records are fictional. Private project input is sent to Hono only after explicit form submission. Start never receives the TypeSafe credential. For development use `npm run dev:program`; the production build emits `dist/client` and `dist/server/server.js`, whose Fetch handler needs a compatible hosting adapter.

Adaptive Canvas implements the pattern demonstrated in the supplied Chris Tate post with an original garden-brief design. It uses `experimental_composeSpec` from the installed, pinned `@json-render/core@0.21.0` with a custom evaluator backed by the TypeSafe SDK. The documentation still described the APIs as unreleased when checked; the installed package exports them. No AI Gateway key is required.

The server builds atomic candidates from the supplied facts and the shared `@sample-jev/canvas-kit` catalog. Jev chooses the root, membership, and sibling order; the official composer validates the tree. The renderer maps that spec to seven app-owned components. Actions are limited to local acknowledgement, copying a title, and opening a local investigation note. Jev cannot invent prose, execute JavaScript, or call arbitrary endpoints. The composer is experimental and its exact version is pinned. The current HTTP route returns the completed snapshot rather than streaming intermediate previews; partial completion is labelled. Displayed timings are measured API round-trip and composition durations, not a promise of millisecond rendering or a comparison against the video.

The catalog and composer tests use a deterministic fake evaluator to check structural validation and rejection of out-of-catalog choices. Live TypeSafe latency and judgment quality require a real key and were not measured.

## Verification

```bash
npm run check
```

This runs type checking, deterministic policy tests, production builds, and a repository secret scan.

For the three new examples, the production API was started and its health (200), invalid input (400), and missing-key (503) responses were checked. Program Match returned server-rendered program content and a 404 for unknown slugs. Interactive browser checks remain unverified because the Chromium download timed out in the build environment; live TypeSafe calls were not run without a configured key.

## Model and thresholds

The default model is pinned to `jev-1.13.0`. All thresholds and weights are demo policy, not universal accuracy guarantees. Evaluate them against representative data before consequential use. Claim Guard does not replace legal review, and Trust Queue never applies an automatic ban or sanction.

## References

- [TypeSafe introduction](https://docs.typesafe.ai/introduction)
- [TypeSafe API reference](https://docs.typesafe.ai/api)
- [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript)
- [Jev model card](https://docs.typesafe.ai/models)
- [TanStack Router](https://tanstack.com/router/latest/docs/overview)
- [TanStack Start](https://tanstack.com/start/latest/docs/framework/react/overview)
- [json-render Jev integration](https://json-render.dev/docs/jev)
