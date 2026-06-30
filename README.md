# ShipFlow AI

> AI-assisted product delivery platform that moves a feature from raw idea to shipped code through a structured, reviewable workflow.

ShipFlow AI is a multi-tenant SaaS that orchestrates the **entire software delivery lifecycle**. A customer or product owner submits a feature request; the platform clarifies it with AI, generates a structured PRD, breaks it into engineering tasks, connects a GitHub repository, tracks pull requests, runs an **AI QA review** against the requirements, loops fixes back to development, and gates the final release behind a **human approval** before marking the feature **shipped**.

The guiding principle: **AI accelerates the work, humans remain the final decision makers.**

```
Feature Request → Product Thinking → PRD → Tasks → Code → AI Review → Fixes → Re-Review → Human Approval → Ship
```

---

## Table of Contents

- [Core Concept & Lifecycle](#core-concept--lifecycle)
- [Feature Highlights](#feature-highlights)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Monorepo Structure](#monorepo-structure)
- [Data Model](#data-model)
- [tRPC API Surface](#trpc-api-surface)
- [HTTP / API Routes](#http--api-routes)
- [AI Features](#ai-features)
- [Inngest Workflows](#inngest-workflows)
- [GitHub Integration](#github-integration)
- [Authentication & RBAC](#authentication--rbac)
- [Billing & Usage Limits](#billing--usage-limits)
- [Feature Lifecycle State Machine](#feature-lifecycle-state-machine)
- [Security & Production Hardening](#security--production-hardening)
- [Application Pages](#application-pages)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database](#database)
- [Developer Scripts & Tooling](#developer-scripts--tooling)
- [Project Scripts](#project-scripts)
- [Deployment](#deployment)
- [Production Readiness Checklist](#production-readiness-checklist)
- [License](#license)

---

## Core Concept & Lifecycle

A feature flows through **five phases**, each with its own gate:

### Phase 1 — Product Discovery
- A feature request is created via any source channel (web, email, support ticket, customer service).
- An **AI completeness analysis** checks for a clear problem statement, user impact, and desired outcome.
- When details are missing, the AI generates targeted **clarification questions**; the user can **answer**, **answer/refine with AI**, or **skip** each one. Re-running analysis accounts for previously answered questions (no duplicates).
- The AI also flags possible **duplicate** functionality so teams don't rebuild what already exists.
- Once the request is complete, an **Inngest workflow** generates a structured **PRD**: problem statement, goals, non-goals, user stories, acceptance criteria, edge cases, and success metrics.

### Phase 2 — Planning
- The PRD is converted into **engineering tasks** (title, description, acceptance criteria) by an AI workflow.
- Tasks live on a **Kanban board** (Backlog / In Progress / In Review / Done) with drag-and-drop.
- The team **approves the task plan** to advance to development.

### Phase 3 — Development
- A **GitHub repository** is connected to the project (OAuth, no hardcoded data).
- Developers (or coding agents) implement tasks and open **pull requests**. PRs are linked to tasks by branch name.
- Webhooks track PR lifecycle (open / synchronize / close / merge).

### Phase 4 — AI Review Loop
- A **QA Agent** reviews each PR's diff against PRD requirements, acceptance criteria, engineering tasks, security, performance, edge cases, and code quality.
- Issues are categorized **Blocking** or **Non-blocking** and posted back to the PR as inline + summary comments.
- Blocking issues send the feature to **Fix Needed**; pushing fixes triggers a **re-review**. The loop continues until the feature passes.

### Phase 5 — Human Approval
- A human reviewer (Admin or Approver) verifies the PRD, tasks, PR, AI review history, and outstanding issues.
- They **approve** (→ Shipped) or **reject** (→ Fix Needed). Only approved features ship.

---

## Feature Highlights

**Product workflow**
- AI requirement clarification with answer / refine-with-AI / skip controls
- Structured PRD generation with an inline section editor and **version history**
- AI task generation + Kanban board with optimistic drag-and-drop
- Task plan approval gate

**AI QA**
- Diff-aware code review against requirements (not just syntax)
- Blocking vs non-blocking categorization with file/line references
- Automatic re-review loop and release-readiness aggregation

**Integrations**
- GitHub OAuth + repository connection + webhook registration
- PR tracking, diff fetching, AI review comment posting, PR sync

**SaaS platform**
- Multi-tenant workspaces with members, roles, and invitations
- Free vs Pro plans, usage limits (AI review credits, repository caps), proactive upgrade prompts
- Razorpay checkout + webhook-driven subscription lifecycle

**Observability & UX**
- Live workflow progress (step-by-step) surfaced in the UI
- Activity feed, in-app notifications, optional Slack + email
- Polished, responsive dashboard with light/dark themes

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router, React 19) |
| Language | TypeScript (strict) |
| API | tRPC v11 (end-to-end type-safe RPC) |
| Database | PostgreSQL + Prisma ORM |
| Auth | BetterAuth (email/password + GitHub OAuth) |
| Payments | Razorpay |
| Async workflows | Inngest (durable, step-based execution) |
| AI | Vercel AI SDK (OpenAI-compatible or Anthropic providers) |
| GitHub | Octokit (REST) + GitHub Webhooks |
| UI | Tailwind CSS + Shadcn UI (`@shipflow/ui`) |
| Animation | Framer Motion |
| Monorepo | Turborepo + pnpm workspaces |
| Rate limiting | Upstash Redis (optional; in-memory fallback) |
| Email | Resend (optional) |
| Hosting | Vercel (app) + Neon/Supabase (Postgres) + Inngest Cloud |

---

## Architecture

The product is a **single Next.js application**. The "backend" — tRPC API, the Inngest serve endpoint, GitHub/Razorpay webhooks, and auth — runs as **API routes inside the same app**. There is no separate backend service to deploy.

```
┌────────────────────────────────────────────────────────────────┐
│ Client (Next.js App Router — RSC + client components)            │
│   Dashboard · Features · PRD editor · Kanban · Reviews · Billing │
└───────────────┬──────────────────────────────────────────────────┘
                │  type-safe tRPC over HTTP (superjson)
┌───────────────▼──────────────────────────────────────────────────┐
│ API routes (apps/web/app/api/*)                                   │
│  /api/trpc · /api/auth · /api/inngest · /api/webhooks/* · ...     │
├───────────────────────────────────────────────────────────────────┤
│ tRPC routers + middleware  (@shipflow/api)                        │
│  auth guard → workspace membership guard → role/permission guard  │
├───────────────────────────────────────────────────────────────────┤
│ Service layer: AI analysis · QA agent · GitHub · billing · webhooks│
├───────────────────────────────────────────────────────────────────┤
│ Inngest functions (@shipflow/inngest) — durable async workflows   │
│  PRD gen · task gen · repo analysis · PR processing · AI review · │
│  release readiness · notifications · digests · maintenance        │
├───────────────────────────────────────────────────────────────────┤
│ Prisma ORM → PostgreSQL                                           │
├───────────────────────────────────────────────────────────────────┤
│ External: GitHub API · AI provider · Razorpay · Inngest Cloud     │
└───────────────────────────────────────────────────────────────────┘
```

**Two execution paths:**

1. **Synchronous (tRPC):** fast, request/response operations — CRUD, completeness analysis, suggest-answer, status reads. Guarded by auth → workspace → permission middleware.
2. **Asynchronous (Inngest):** long-running, multi-step, AI-heavy operations — PRD generation, task generation, repository analysis, PR processing, AI review, release readiness. Each step persists progress to a `Workflow` row that the UI polls/streams for live progress.

---

## Monorepo Structure

```
shipflow-ai/
├── apps/
│   └── web/                          # Next.js 15 app (frontend + all API routes)
│       ├── app/
│       │   ├── (marketing)/          # Public landing page
│       │   ├── (auth)/               # login, register, invite/[token]
│       │   ├── (dashboard)/          # dashboard, features, prd, tasks,
│       │   │                         #   github, reviews, approvals,
│       │   │                         #   analytics, billing, workspace, settings
│       │   └── api/
│       │       ├── trpc/[trpc]/      # tRPC HTTP handler
│       │       ├── auth/[...all]/    # BetterAuth handler
│       │       ├── inngest/          # Inngest serve endpoint
│       │       ├── webhooks/github/  # GitHub webhook receiver (HMAC verified)
│       │       ├── webhooks/razorpay/# Razorpay webhook receiver
│       │       ├── invites/[token]/  # invite info + accept
│       │       ├── workflow/[id]/stream/ # SSE workflow progress
│       │       └── health/           # health check
│       ├── components/               # UI components
│       ├── lib/                      # tRPC client, providers, contexts
│       └── vercel.json               # monorepo build config
├── packages/
│   ├── api/                          # tRPC routers, middleware, services, lib
│   ├── auth/                         # BetterAuth server/client + RBAC permissions
│   ├── database/                     # Prisma schema, client, migrations, seed
│   ├── inngest/                      # Inngest client, events, functions, crypto
│   ├── ui/                           # Shared Shadcn UI components
│   ├── eslint-config/                # Shared ESLint config
│   └── typescript-config/            # Shared tsconfig
├── scripts/                          # Local dev/demo utilities (no secrets)
├── e2e-test.mjs                      # End-to-end backend test harness
├── turbo.json · pnpm-workspace.yaml · package.json
```

### Workspace packages

| Package | Responsibility |
|---------|----------------|
| `@shipflow/web` | Next.js app — UI + API routes |
| `@shipflow/api` | tRPC routers, middleware, services (AI analysis, QA agent, GitHub, billing, activity), crypto/rate-limit/logger libs |
| `@shipflow/auth` | BetterAuth server config, client hooks, and the RBAC permission matrix |
| `@shipflow/database` | Prisma schema + generated client + migrations + seed |
| `@shipflow/inngest` | Inngest client, typed events, workflow functions, AES-256-GCM secret crypto |
| `@shipflow/ui` | Shared Shadcn UI primitives |

> Workspace packages (`api`, `auth`, `database`, `inngest`) are built with `tsup` to `dist/` and consumed by the app. After editing them, rebuild before they take effect at runtime (`pnpm build` or per-package `build`).

---

## Data Model

PostgreSQL via Prisma. Schema: `packages/database/prisma/schema.prisma`.

### Models

| Domain | Models |
|--------|--------|
| Auth & identity | `User`, `Account`, `Session`, `Verification` |
| Workspace | `Workspace`, `WorkspaceMember`, `WorkspaceInvitation` |
| Projects & GitHub | `Project`, `Repository`, `PullRequest` |
| Feature flow | `FeatureRequest`, `Clarification`, `PRD`, `PRDVersion`, `Task` |
| AI review | `AIReview`, `ReviewIssue` |
| Approval & workflow | `Approval`, `Workflow` |
| Billing | `BillingSubscription`, `UsageLog` |
| Activity & system | `Activity`, `Notification`, `ProcessedWebhookEvent` |

### Key relationships

- `Workspace 1—* WorkspaceMember *—1 User` (multi-tenant membership with a role)
- `Workspace 1—* Project 1—* Repository` and `Project 1—* FeatureRequest`
- `FeatureRequest 1—* Clarification`, `1—1 PRD`, `1—* Task`, `1—* Approval`
- `PRD 1—* PRDVersion` (edit history; regeneration snapshots the prior version)
- `Repository 1—* PullRequest 1—* AIReview 1—* ReviewIssue`
- `Task 0..1—* PullRequest` (linked by branch name during PR processing)
- `Workflow` tracks any async job (optionally linked to a `FeatureRequest`)
- `BillingSubscription 1—1 Workspace`; `UsageLog *—1 Workspace`

### Enums

| Enum | Values |
|------|--------|
| `WorkspaceRole` | `ADMIN`, `MEMBER`, `APPROVER` |
| `FeaturePhase` | `DISCOVERY`, `PLANNING`, `DEVELOPMENT`, `AI_REVIEW`, `HUMAN_APPROVAL`, `SHIPPED`, `FIX_NEEDED` |
| `SourceChannel` | `WEB`, `EMAIL`, `SUPPORT_TICKET`, `CUSTOMER_SERVICE` |
| `PRStatus` | `OPEN`, `CLOSED`, `MERGED` |
| `PRDStatus` | `DRAFT`, `IN_REVIEW`, `APPROVED`, `REVISION_NEEDED` |
| `TaskStatus` | `BACKLOG`, `IN_PROGRESS`, `IN_REVIEW`, `DONE` |
| `ReviewStatus` | `PENDING`, `IN_PROGRESS`, `COMPLETED`, `FAILED` |
| `IssueCategory` | `BLOCKING`, `NON_BLOCKING` |
| `ApprovalStatus` | `PENDING`, `APPROVED`, `REJECTED` |
| `WorkflowType` | `PRD_GENERATION`, `TASK_GENERATION`, `REPO_ANALYSIS`, `PR_PROCESSING`, `AI_REVIEW`, `RE_REVIEW`, `RELEASE_READINESS` |
| `WorkflowStatus` | `PENDING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED` |
| `BillingTier` | `FREE`, `PRO` |

> GitHub numeric identifiers (`Repository.githubId`, `Repository.webhookId`, `Repository.installationId`, `PullRequest.githubPrId`) are stored as **`BigInt`** because modern GitHub IDs exceed 32-bit range.

---

## tRPC API Surface

Root router: `packages/api/src/root.ts`. All procedures are type-safe end-to-end and protected by layered middleware (`protectedProcedure` → `workspaceProcedure` → `roleGuardedProcedure`).

| Router | Representative procedures |
|--------|---------------------------|
| `health` | `check` |
| `user` | `me`, `connections`, `updateProfile`, `updateNotificationPrefs` |
| `workspace` | `create`, `list`, `getById`, `listMembers`, `invite`, `acceptInvite`, `declineInvite`, `updateMemberRole`, `removeMember`, `setSlackWebhook`, `update` |
| `project` | `list`, `getById`, `create`, `update`, `delete`, `stats` |
| `featureRequest` | `create`, `list`, `getById`, `analyze`, `submitClarification`, `skipClarification`, `suggestAnswer`, `triggerPRD` |
| `prd` | `getByFeature`, `update`, `approve`, `getVersionHistory` |
| `task` | `list`, `create`, `move`, `delete`, `generateFromPRD`, `approveTaskPlan`, `rejectTaskPlan` |
| `github` | `connectRepo`, `listRepos`, `listAvailableRepos`, `disconnectRepo`, `listPRs`, `getPRDetails`, `syncPRs` |
| `review` | `getReviewHistory`, `triggerReview`, `retryReview` |
| `approval` | `getApprovalQueue`, `approve`, `reject`, `notifyApprovers` |
| `billing` | `getCurrentPlan`, `getUsage`, `createCheckout`, `cancelSubscription` |
| `analytics` | `getMetrics` |
| `activity` | `list` |
| `notification` | `list`, `unreadCount`, `markRead` |
| `workflow` | `getStatus`, `getLatestForFeature`, `cancel`, `retry` |

### Middleware chain
1. **`protectedProcedure`** — requires an authenticated BetterAuth session.
2. **`workspaceProcedure`** — additionally verifies the user is a member of the target workspace and injects `ctx.membership`.
3. **`roleGuardedProcedure(Permission)`** — additionally checks the member's role grants the required permission.
4. **`rateLimitMiddleware`** — applied to expensive AI-trigger mutations (`analyze`/`prd.trigger`/`clarify.suggest`/`review.trigger`).

---

## HTTP / API Routes

| Route | Purpose |
|-------|---------|
| `POST/GET /api/trpc/[trpc]` | tRPC handler (superjson transformer) |
| `* /api/auth/[...all]` | BetterAuth (sign-in/up, OAuth callback, session, link social) |
| `PUT/POST/GET /api/inngest` | Inngest serve endpoint (registers all workflow functions) |
| `POST /api/webhooks/github` | GitHub webhook receiver — HMAC-SHA256 verified, idempotent, queues to Inngest |
| `POST /api/webhooks/razorpay` | Razorpay webhook receiver — signature verified, drives subscription lifecycle |
| `GET /api/invites/[token]` | Public invitation details for the accept page |
| `POST /api/invites/[token]/accept` | Accept a workspace invitation (auth required) |
| `GET /api/workflow/[id]/stream` | Server-sent events stream of workflow progress |
| `GET /api/health` | Health check with a database ping |

---

## AI Features

All AI runs through the **Vercel AI SDK** via a centralized, provider-agnostic helper (`packages/api/src/lib/ai.ts` and `packages/inngest/src/ai.ts`). Structured outputs are produced with `streamText` + a JSON-Schema instruction + Zod validation, which works across OpenAI-compatible and Anthropic endpoints. Provider/model are configured purely by environment variables.

| Capability | Where | What it does |
|------------|-------|--------------|
| **Completeness analysis** | `featureRequest.analyze` | Detects missing problem statement / user impact / desired outcome; generates 1–5 non-duplicate clarification questions; flags possible duplicates. Accounts for already-answered/skipped clarifications on re-runs. |
| **Suggest / refine answer** | `featureRequest.suggestAnswer` | Drafts (or refines) an answer to a clarification question, grounded in the feature title/description. |
| **PRD generation** | Inngest `prd-generation` | Produces problem statement, goals, non-goals, user stories, acceptance criteria, edge cases, success metrics. |
| **Task generation** | Inngest `task-generation` | Decomposes an approved PRD into engineering tasks with acceptance criteria. |
| **Repository analysis** | Inngest `repo-analysis` | Analyzes connected repo structure and indexes metadata. |
| **AI code review (QA agent)** | Inngest `ai-review` | Reviews the PR diff against PRD, acceptance criteria, tasks, security, performance, edge cases, quality; categorizes blocking vs non-blocking; posts GitHub comments. |
| **Release readiness** | Inngest `release-readiness` | Aggregates review outcomes and drives the post-review phase transition. |

### Provider configuration
- `AI_PROVIDER=openai` (default) works with OpenAI **or any OpenAI-compatible endpoint** via `OPENAI_BASE_URL` (e.g. a self-hosted gateway or compatible service), with `OPENAI_API_KEY` and `OPENAI_MODEL`.
- `AI_PROVIDER=anthropic` uses `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL`.

The AI helper surfaces underlying provider errors (HTTP status + response body) so misconfigurations are diagnosable instead of failing silently.

---

## Inngest Workflows

Long-running work is durable and observable. Each function writes step progress to a `Workflow` row (`currentStep`, `completedSteps`, `totalSteps`, `status`), which the UI reads via `workflow.getLatestForFeature` (polling) or `/api/workflow/[id]/stream` (SSE).

### Typed events (`packages/inngest/src/events.ts`)

| Event | Triggered by | Consumed by |
|-------|--------------|-------------|
| `feature/prd.generate` | `featureRequest.triggerPRD` | PRD Generation |
| `prd/tasks.generate` | `task.generateFromPRD` | Task Generation |
| `review/pr.review` | PR processing / `review.triggerReview` | AI Review |
| `review/completed` | AI Review | Release Readiness |
| `webhook/process` | GitHub webhook receiver | PR Processing |
| `notify/dispatch` | many sources | Notification Dispatch |

### Functions (`packages/inngest/src/functions/`)

| Function | Steps (high level) |
|----------|--------------------|
| **PRD Generation** | create workflow → analyze request → check clarifications complete → generate PRD (AI) → validate sections → save + advance to Planning |
| **Task Generation** | parse PRD → decompose into tasks (AI) → create Kanban cards → notify |
| **Repo Analysis** | clone metadata → analyze structure → index |
| **PR Processing** | validate → fetch diff → match task by branch → store PR → (trigger AI review if task-linked) |
| **AI Review** | fetch context (PRD/tasks/diff) → analyze (AI) → categorize issues → post GitHub comments → update phase → record usage |
| **Release Readiness** | aggregate review results → transition to Human Approval or Fix Needed → notify approvers |
| **Notification Dispatch** | resolve recipients (users/roles/creator) → in-app + optional Slack + optional email, respecting prefs |
| **Weekly Digest** | scheduled (Mon 09:00 UTC) workspace activity summary |
| **Webhook Event Prune** | scheduled daily cleanup of processed webhook idempotency records |

### Local dev
```bash
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```
The serve endpoint is `/api/inngest`. In production, register the app in **Inngest Cloud** and set the signing/event keys (do **not** set `INNGEST_DEV`).

---

## GitHub Integration

Implemented with **Octokit** (`packages/api/src/services/github.ts`); no hardcoded PR data.

**Capabilities**
- Connect a repository to a project via the user's GitHub OAuth token (resolved server-side from the linked account and decrypted at rest — clients never handle the token).
- Register repository **webhooks** for `push`, `pull_request`, `pull_request_review`.
- Receive webhooks at `/api/webhooks/github`, **verify HMAC-SHA256** against the per-repo secret, dedupe by delivery id, and queue to Inngest.
- Fetch changed files / diffs, list & **sync PRs**, match PRs to tasks by branch.
- **Post AI review comments** back to the PR (inline review for line-specific issues + a summary comment).
- Disconnect a repository (removes the webhook and the record).

**Connection requirements**
- The GitHub OAuth app must grant the **`repo`** scope. The UI accurately distinguishes an identity-only link from one with repository access and prompts to reconnect when the `repo` scope is missing.
- Webhook URL is derived from `BETTER_AUTH_URL` (`/api/webhooks/github`). On `localhost`, GitHub cannot reach the app, so webhook registration is best-effort and a **Sync PRs** button + the local simulator script let you exercise the flow without a tunnel.

---

## Authentication & RBAC

**BetterAuth** (`packages/auth`) provides:
- Email/password (min 8 chars) and **GitHub OAuth** social login.
- Account linking (link GitHub to an existing email account, even with different emails).
- 24-hour inactivity session expiry.
- **OAuth tokens encrypted at rest** (AES-256-GCM) via database hooks.

### Permission matrix (`packages/auth/src/permissions.ts`)

| Permission | ADMIN | MEMBER | APPROVER |
|------------|:-----:|:------:|:--------:|
| Manage members / roles / billing / settings | ✅ | — | — |
| Create/edit projects, tasks, feature requests | ✅ | ✅ | — |
| View workspace data | ✅ | ✅ | ✅ |
| Approve / reject PRD | ✅ | — | ✅ |
| Approve / reject release | ✅ | — | ✅ |

`hasPermission(role, permission)` gates server procedures; the UI mirrors the same matrix.

---

## Billing & Usage Limits

**Razorpay** powers Free vs Pro plans (`packages/api/src/routers/billing.ts`, `services/billing.ts`).

- **Free** plan with monthly **AI review credits** and a **repository cap**; **Pro** raises the limits.
- Usage is tracked in `UsageLog` and counted **within the workspace's billing cycle** window. AI reviews increment usage when an AI review completes; repository usage is the count of connected repos.
- `checkUsageLimit` enforces caps before expensive actions (connecting repos, triggering reviews) and returns upgrade-prompting messages when exceeded.
- The Billing page shows live usage bars and a **proactive "Upgrade to Pro"** banner at ≥80% (warning) and at 100% (limit reached).
- **Checkout** opens a Razorpay payment link; the **Razorpay webhook** (`/api/webhooks/razorpay`, signature-verified + idempotent) activates/cancels the subscription and resets usage on upgrade.

---

## Feature Lifecycle State Machine

`packages/api/src/lib/state-machine.ts` enforces valid transitions:

```
DISCOVERY    → PLANNING
PLANNING     → DEVELOPMENT
DEVELOPMENT  → AI_REVIEW
AI_REVIEW    → HUMAN_APPROVAL | FIX_NEEDED
FIX_NEEDED   → AI_REVIEW
HUMAN_APPROVAL → SHIPPED | FIX_NEEDED
SHIPPED      → (terminal)
```

Invalid transitions are rejected, keeping the pipeline consistent regardless of which actor (UI, workflow, webhook) requests a change.

---

## Security & Production Hardening

- **Secrets at rest:** GitHub OAuth access/refresh tokens, repository webhook secrets, and Slack webhook URLs are encrypted with **AES-256-GCM** (`ENCRYPTION_KEY`). Decryption falls back to plaintext for legacy rows, so enabling encryption is safe on existing data.
- **Webhook integrity:** GitHub and Razorpay webhooks verify HMAC signatures with timing-safe comparison and are **idempotent** (duplicate deliveries are recorded in `ProcessedWebhookEvent` and ignored; pruned daily).
- **Rate limiting:** inbound webhooks and expensive AI-trigger mutations are rate-limited. Set `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` for limits that hold across serverless instances; otherwise an in-memory limiter is used.
- **Security headers:** `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, HSTS, and `Permissions-Policy` are applied to all responses; `X-Powered-By` is disabled (`apps/web/next.config.ts`).
- **AuthZ everywhere:** every workspace-scoped procedure verifies membership; sensitive actions verify role permissions.
- **No secrets in the repo:** all `.env` files are gitignored; only `.env.example` (placeholders) is committed.

---

## Application Pages

| Page | Route | Description |
|------|-------|-------------|
| Landing | `/` | Marketing page |
| Login / Register | `/login`, `/register` | Email/password + GitHub OAuth |
| Invite accept | `/invite/[token]` | Accept a workspace invitation |
| Dashboard | `/dashboard` | Pipeline overview, attention items, activity feed |
| Features | `/features`, `/features/new`, `/features/[id]` | Request list, intake, detail (analysis, clarifications, PRD trigger, live progress) |
| PRD | `/prd`, `/prd/[id]` | PRD list + section editor with version history |
| Tasks | `/tasks` | Kanban board + task plan approval |
| GitHub | `/github` | Connect/disconnect repos, browse, sync PRs |
| Reviews | `/reviews`, `/reviews/[id]` | PR list + review detail (diffs, iterations, issues, trigger/retry) |
| Approvals | `/approvals` | Human approval queue (Admin/Approver) |
| Analytics | `/analytics` | Delivery metrics, features-by-phase, review quality |
| Billing | `/billing` | Plan, usage, upgrade |
| Workspace | `/workspace`, `/workspace/new` | Settings, members, invitations |
| Settings | `/settings`, `/settings/[tab]` | Profile, account, notifications, appearance, integrations |

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm 9+
- PostgreSQL 15+
- A GitHub account (OAuth app for login + repo integration)
- An AI provider key (OpenAI-compatible or Anthropic)

### Installation
```bash
git clone <your-repo-url>
cd shipflow-ai
pnpm install

# Configure environment
cp .env.example .env            # fill in values (see table below)

# Generate the Prisma client and apply the schema
pnpm --filter @shipflow/database db:generate
pnpm --filter @shipflow/database db:push        # or db:migrate for migrations
pnpm --filter @shipflow/database db:seed        # optional sample data
```

### Run in development
Two processes are needed — the app and the Inngest dev server (for workflows):

```bash
# Terminal 1 — the app
pnpm dev                         # http://localhost:3000

# Terminal 2 — Inngest dev server (PRD/task/review workflows)
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest
```

Open http://localhost:3000, register, create a workspace + project, and submit a feature request to walk the full pipeline. The Inngest dashboard at http://localhost:8288 shows workflow runs.

### Verify a production build
```bash
pnpm lint && pnpm typecheck && pnpm build
```
> Stop the dev server before running `pnpm build` — both use `apps/web/.next`, and running them simultaneously corrupts the build output.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in values. **Never commit `.env` files** (they are gitignored).

| Variable | Required | Description |
|----------|:--------:|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string. On serverless, use a **pooled** endpoint. |
| `BETTER_AUTH_SECRET` | ✅ | Session encryption secret. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | ✅ | App base URL (e.g. `http://localhost:3000` or your prod URL). |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | ✅ | Public-facing auth URL (same as above). |
| `GITHUB_CLIENT_ID` | ✅ | GitHub OAuth App client id. |
| `GITHUB_CLIENT_SECRET` | ✅ | GitHub OAuth App client secret. |
| `ENCRYPTION_KEY` | ✅ | Min 16 chars; encrypts secrets at rest. Generate a strong random value. |
| `AI_PROVIDER` | ✅ | `openai` (default) or `anthropic`. |
| `OPENAI_API_KEY` | ✅* | API key when using the OpenAI-compatible provider. |
| `OPENAI_BASE_URL` |  | Optional OpenAI-compatible base URL; unset = `api.openai.com`. |
| `OPENAI_MODEL` |  | Model id (default `gpt-4o-mini`). |
| `ANTHROPIC_API_KEY` | ✅* | API key when `AI_PROVIDER=anthropic`. |
| `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` |  | Anthropic endpoint/model overrides. |
| `INNGEST_EVENT_KEY` | ✅ | Inngest event key (from Inngest Cloud in prod). |
| `INNGEST_SIGNING_KEY` | ✅ | Inngest signing key. |
| `INNGEST_DEV` | dev only | Set to `1` **only** for the local Inngest dev server. Omit in production. |
| `RAZORPAY_KEY_ID` | billing | Razorpay key id. |
| `RAZORPAY_KEY_SECRET` | billing | Razorpay key secret. |
| `RAZORPAY_WEBHOOK_SECRET` | billing | Verifies Razorpay webhook signatures. |
| `RAZORPAY_PRO_PLAN_ID` / `RAZORPAY_PRO_AMOUNT` / `RAZORPAY_CURRENCY` |  | Pro plan / checkout configuration. |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` |  | Distributed rate limiting; in-memory fallback if unset. |
| `RESEND_API_KEY` / `EMAIL_FROM` |  | Transactional email; no-op if unset. |
| `SENTRY_DSN` |  | Server error reporting. |

\* Provide the key for whichever `AI_PROVIDER` is selected.

---

## Database

```bash
pnpm --filter @shipflow/database db:generate   # generate Prisma client
pnpm --filter @shipflow/database db:push        # sync schema (no migration history)
pnpm --filter @shipflow/database db:migrate     # create/apply a migration
pnpm --filter @shipflow/database db:seed        # seed sample data
```
Schema: `packages/database/prisma/schema.prisma`. If the Prisma engine appears locked on Windows, stop the dev server before `db:generate`.

---

## Developer Scripts & Tooling

Local utilities (no secrets — they read values from `apps/web/.env` at runtime). Run with the app + Inngest dev server running.

| Script | Purpose |
|--------|---------|
| `node e2e-test.mjs` | End-to-end backend test: signs up, then drives every router + the AI/Inngest workflows (auth → workspace → project → feature → analyze → PRD → tasks → review guard → billing/analytics → invites). |
| `node scripts/create-test-pr.mjs` | Opens a throwaway PR in the connected repo. |
| `node scripts/simulate-github-webhook.mjs` | Sends a properly HMAC-signed `pull_request` webhook to the local app (tests the webhook → Inngest path without a tunnel). |
| `node scripts/trigger-review.mjs` | Fires an AI review for the latest stored PR. |
| `node scripts/demo-approval-flow.mjs` | Links a task → opens a PR → review → shows the FIX_NEEDED path. |
| `node scripts/demo-approval-pass.mjs --preset health\|version\|ping` | Creates a small, satisfiable feature whose PR passes review and reaches the Approval Queue. |

> These scripts are development aids; they can be removed for a minimal public repo.

---

## Project Scripts

Run from the repo root (Turborepo orchestrates the workspaces):

```bash
pnpm dev          # run the app in development
pnpm build        # build all packages and the app
pnpm typecheck    # type-check the whole monorepo
pnpm lint         # lint all packages
pnpm format       # Prettier write
```

---

## Deployment

The app deploys as a **single Next.js application** (frontend + all API/backend routes). There is no separate backend service to host.

### Recommended free-tier stack

| Piece | Service (free tier) | Notes |
|-------|---------------------|-------|
| App (web + API routes) | **Vercel** (Hobby) | Native Next.js host; config in `apps/web/vercel.json` |
| PostgreSQL | **Neon** (or Supabase) | Use the **pooled** connection string for serverless |
| Async workflows | **Inngest Cloud** | Invokes `/api/inngest` over HTTPS — no always-on server needed |
| Redis (optional) | **Upstash** | Distributed rate limiting; in-memory fallback if unset |
| Email (optional) | **Resend** | Invites/weekly digest; no-op if unset |

> Render/Railway free *web service* tiers spin down on idle (cold starts + missed webhooks), so they are not recommended for this app. Vercel + Neon + Inngest Cloud is the reliable free combination.

### Vercel setup
1. Push to GitHub (verify no `.env` is committed).
2. Import the repo into Vercel and set the **Root Directory** to `apps/web` (it reads `vercel.json` for the Turbo monorepo build).
3. Add the environment variables (see the [table](#environment-variables)).
4. Deploy, then copy the production URL and update the auth/OAuth/webhook values below, and redeploy.

### Production environment checklist
- `DATABASE_URL` → Neon **pooled** URL (`sslmode=require`).
- `BETTER_AUTH_URL` and `NEXT_PUBLIC_BETTER_AUTH_URL` → your production URL.
- `BETTER_AUTH_SECRET`, `ENCRYPTION_KEY` → fresh strong values (not dev defaults).
- **GitHub OAuth App** → callback URL `https://<your-domain>/api/auth/callback/github`; set the `repo` scope; use prod client id/secret.
- **Inngest** → set `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` from Inngest Cloud and register the app at `https://<your-domain>/api/inngest`. **Do not set `INNGEST_DEV`.**
- **Razorpay** → keys + webhook to `https://<your-domain>/api/webhooks/razorpay`.
- Run migrations against the production database once (`db:migrate` / `db:push`).
- GitHub repo webhooks auto-register to `BETTER_AUTH_URL/api/webhooks/github`, so set `BETTER_AUTH_URL` correctly before connecting repos.

---

## Production Readiness Checklist

- ✅ Type-safe end-to-end (tRPC + Prisma + TypeScript strict)
- ✅ Layered authorization (auth → workspace → role/permission)
- ✅ Secrets encrypted at rest; signature-verified, idempotent webhooks
- ✅ Rate limiting (Upstash with in-memory fallback)
- ✅ Security headers + disabled `X-Powered-By`
- ✅ Durable async workflows with visible progress
- ✅ Health endpoint (`/api/health`) for uptime checks
- ✅ CI workflow (`.github/workflows/ci.yml`) — lint, typecheck, test, build
- ✅ Clean production build (`pnpm build`)

Verify before deploying:
```bash
pnpm lint && pnpm typecheck && pnpm build
```

---

## License

MIT.
