# TinyEnginy: Codebase Analysis & Improvement Roadmap

| | |
|---|---|
| **Type** | Epic / Tech roadmap |
| **Owner** | Jorge |
| **Status** | Proposed, pending prioritization |
| **Last updated** | 2026-10-12 |

## Summary

TinyEnginy works for a single user on a laptop with a few hundred leads. Before real customers use it, the biggest risks are **data integrity** (weak validation and dedup, contract drift between the frontend and backend), **security** (no auth, wildcard CORS), and **scalability of the leads table** (no pagination, a full-list poll every 2s).

The async enrichment work done recently (email verification and phone enrichment moved to fire-and-forget Temporal workflows with per-lead status) gives us a good pattern. Most items below spread that pattern, or the guardrails around it, to the rest of the app.

Items are grouped by priority. Effort uses T-shirt sizes (S ≈ ≤1 day, M ≈ 2–4 days, L ≈ 1–2 weeks).

## Priority overview

| ID | Item | Area | Impact | Effort | Priority |
|---|---|---|---|---|---|
| IMP-01 | Schema validation on every endpoint (zod) | Backend | High | M | P0 |
| IMP-02 | Fix frontend ↔ backend contract drift; share types | Full-stack | High | M | P0 |
| IMP-03 | Authentication, multi-tenancy and CORS | Backend | High | L | P0 |
| IMP-04 | Country code validation in CSV import (known bug) | Full-stack | Medium | S | P0 |
| IMP-05 | Lead deduplication on email + DB unique constraint | Data | High | S | P0 |
| IMP-06 | Pagination, filtering and targeted polling for the leads table | Full-stack | High | M | P1 |
| IMP-07 | Production database and migration workflow | Infra | High | M | P1 |
| IMP-08 | Split the API and Temporal worker; externalize config | Infra | Medium | M | P1 |
| IMP-09 | Observability: structured logs, error tracking, enrichment metrics | Ops | Medium | M | P1 |
| IMP-10 | CI pipeline (lint, typecheck, tests, build) | Ops | Medium | S | P1 |
| IMP-11 | Bulk import: batched writes, async for large files | Backend | Medium | M | P2 |
| IMP-12 | Backend modularization (routes / services / repositories) | Backend | Medium | M | P2 |
| IMP-13 | Frontend component decomposition and consistency | Frontend | Medium | M | P2 |
| IMP-14 | Generic "enrichment" framework | Product / Backend | High | L | P2 |
| IMP-15 | Enrichment audit trail and cost tracking | Product / Data | Medium | M | P3 |
| IMP-16 | Test coverage: API integration + workflow + e2e | Quality | Medium | L | P3 |

---

## P0: Must fix before onboarding real customers

### IMP-01 · Schema validation on every endpoint

**Problem.** Every route hand-rolls its own checks (`typeof x === 'string' && x.trim()`), and some routes have none:
- `PATCH /leads/:id` writes `String(name)` and `String(email)` without checks, so a partial update stores the literal string `"undefined"`.
- `GET/PATCH/DELETE /leads/:id` pass `Number(id)` straight to Prisma. A non-numeric id becomes `NaN` and returns a 500. A missing lead returns `200 null` instead of 404.
- `POST /leads/bulk` stores any `countryCode`, `email` or `jobTitle` string the client sends. The CSV parser's validation is client-side only and easy to bypass.

**Proposal.** Add `zod` schemas per endpoint, a `validate(schema)` middleware, and a central error handler that maps validation errors to 400, `P2025` (record not found) to 404, and anything else to 500 with a request id. Share the field rules (email, phone, LinkedIn URL, ISO country) with the frontend parser so both sides apply the same rules.

**Acceptance criteria.**
- Every route has a request schema. Invalid input returns 400 with field-level errors.
- `PATCH` only updates the fields it receives.
- Unknown ids return 404.

### IMP-02 · Fix contract drift between frontend and backend; share types

**Problem.** The API types are written twice by hand (`frontend/src/api/types/**` and the inline types in the backend), and they have already drifted apart:
- `leadsApi.update` sends `PUT`, but the backend only exposes `PATCH`.
- `leadsApi.create` sends `firstName`, but the backend reads `name`.
- `LeadsCreateOutput` / `getOne` types don't match what Prisma returns.

These calls don't work today. Nobody has noticed because no UI uses them yet.

**Proposal.** Short term: fix the three mismatches above. Medium term: make the zod schemas from IMP-01 the single source of truth, export the inferred types from a shared `packages/contracts` workspace (or generate an OpenAPI spec and a typed client from it). Then any drift is caught at compile time.

**Acceptance criteria.** The frontend imports request and response types from the shared package, and CI fails when the contract changes on only one side.

### IMP-03 · Authentication, multi-tenancy and CORS

**Problem.** The API has no authentication. Anyone who can reach port 4000 can read, delete or enrich every lead, and enrichment calls paid providers. CORS is `*`. The data model has no notion of an owner or workspace.

**Proposal.**
1. Add authentication (session or JWT via our identity provider) as middleware on every route.
2. Add `workspaceId` to `lead` and scope every query by it.
3. Restrict CORS to known origins from config.
4. Rate-limit expensive endpoints (`/enrich-phones`, `/verify-emails`) per workspace.

**Acceptance criteria.** Unauthenticated requests return 401. A user can only see and act on their own workspace's leads.

### IMP-04 · Country code validation in CSV import (known bug)

**Problem.** `countryCode` is accepted as free text on both the client and the server. `docs/leads-with-errors.csv` imports values like full country names or invalid codes with no warning. That breaks anything that later depends on the country (phone formatting, segmentation, message templates).

**Proposal.** Validate against ISO 3166-1 alpha-2. Normalize case and map common country names to codes ("Spain" → `ES`). Flag the row in the import preview. Enforce the same rule server-side (IMP-01).

**Acceptance criteria.** Invalid countries show as row errors in the preview and are rejected by the API.

### IMP-05 · Lead deduplication on email + unique constraint

**Problem.** Bulk import deduplicates on `firstName + lastName`:
- Two different "John Smith"s collapse into one lead.
- The same person imported twice with different name casing gets through, because the DB lookup is case-sensitive while the in-memory key is lowercased.
- `email` has no unique constraint, so the single-create path can insert duplicates.

**Proposal.** Normalize email (trim + lowercase) and add `@@unique([workspaceId, email])`. Dedupe on email during import, and report "updated" vs "skipped" for existing leads, optionally with an "update existing" toggle. Run a one-off migration script to merge existing duplicates.

**Acceptance criteria.** The DB rejects duplicate emails within a workspace. The import summary distinguishes new, duplicate and invalid rows.

---

## P1: Scale and operability

### IMP-06 · Pagination, filtering and targeted polling

**Problem.**
- `GET /leads` returns the whole table, and the table renders every row.
- While any enrichment is `pending`, the frontend refetches the entire list every 2s.

With 10k+ leads this means large payloads, a slow UI and unnecessary DB load.

**Proposal.**
- Cursor-based pagination with server-side sort and filter (status, country, company, "has phone").
- Virtualized table rows.
- Poll only the pending ids (`GET /leads?ids=…` or `GET /enrichments/status`), and later move to SSE/WebSocket push from the workflows.
- "Select all matching filter" so bulk actions don't need every id on the client.

**Acceptance criteria.** The leads page loads in under 1s with 50k leads, and a polling request only returns pending leads.

### IMP-07 · Production database and migration workflow

**Problem.**
- SQLite file path is hardcoded in `schema.prisma`, and `DATABASE_URL` is not used.
- SQLite serializes writes, which concurrent workflow activities will hit.
- Status columns are free-form strings with only a comment documenting the allowed values.
- `emailVerified` and `emailVerificationStatus` overlap.

**Proposal.**
- Move to Postgres, configured via `DATABASE_URL`.
- Use `prisma migrate deploy` in the release pipeline.
- Turn the status columns into enums.
- Drop the redundant `emailVerified` once the frontend reads only the status.
- Add indexes for the new filters (IMP-06).

### IMP-08 · Split the API and Temporal worker; externalize config

**Problem.**
- `index.ts` starts both the HTTP server and the Temporal workers, so they can't scale or deploy independently, and a crash in one kills the other.
- The Temporal address (`localhost:7233`), namespace, task queue name (`myQueue`) and HTTP port are hardcoded.

**Proposal.**
- Separate `api` and `worker` entrypoints and deployables.
- Add a typed config module (zod-validated env) that fails fast on missing provider keys.
- Give the task queue a meaningful name (`lead-enrichment`).
- Add a `docker-compose` with Postgres + Temporal for local dev.

### IMP-09 · Observability

**Problem.** Logging is `console.log` / `console.error` only. There's no error tracking, and we can't answer basic product questions: which phone provider finds the most numbers? What does each found phone cost? How often does email verification time out?

**Proposal.**
- Structured logger (pino) with request ids.
- Sentry on the frontend and backend.
- Metrics per enrichment provider: hit rate, latency, errors, cost.
- Temporal UI/visibility access for support.
- Alerts on workflow failure rate.

### IMP-10 · CI pipeline

**Problem.** No CI. Tests, typecheck and prettier are only run by hand (`LeadsList.tsx` isn't prettier-formatted, for example). The Dependabot PR (vitest 4) has no checks to validate it.

**Proposal.** GitHub Actions on every PR: install, `prisma generate`, typecheck, lint/format check, unit tests and build for both apps. Make it required before merging. Also add a PR template with a "migration included?" checklist.

---

## P2: Maintainability and product foundations

### IMP-11 · Bulk import performance

**Problem.** Import runs one `INSERT` per row, sequentially, inside the HTTP request. The whole CSV is parsed in the browser and sent as one JSON body. A 50k-row file would time out.

**Proposal.**
- `createMany` in chunks inside a transaction.
- For large files, upload the file and process it in a Temporal workflow with progress reporting, using the same pending/done UX as enrichments.
- Add a body size limit.

### IMP-12 · Backend modularization

**Problem.** All routes live in a single ~430-line `index.ts`, with request parsing, business rules and Prisma calls mixed together. The same boilerplate (`leadIds` validation, `{ leadId, leadName, error }` error shape) is copy-pasted across endpoints.

**Proposal.** Structure the backend as `routes/` → `services/` → `repositories/`, with shared helpers for "bulk action over lead ids" and a consistent response envelope. This also makes unit testing possible without HTTP.

### IMP-13 · Frontend component decomposition

**Problem.**
- `LeadsList.tsx` (~480 lines) holds the table, the toolbar, the enrich dropdown, every mutation and many inline SVGs.
- The `useApiMutation` abstraction exists but is barely used.
- There's no error boundary.
- "Guess Gender" ships as a disabled stub that shows an error toast.

**Proposal.**
- Extract `LeadsTable`, `LeadsToolbar`, `EnrichMenu`, a status badge component and an icon set.
- One hook per action (`useEnrichPhones`, …).
- Add an error boundary.
- Hide unfinished actions behind a feature flag instead of shipping a stub button.

### IMP-14 · Generic enrichment framework

**Problem.** Email verification and phone enrichment each add their own endpoint, status columns, workflow, polling condition and menu entry. Gender guessing (open PR) would be the third copy-paste, and each new enrichment costs about as much as the previous one.

**Proposal.** Model enrichments as data:
- An `enrichment_run` table (`leadId`, `type`, `status`, `provider`, `result`, `cost`, timestamps).
- A single `POST /leads/enrich { type, leadIds, options }` endpoint.
- A registry of enrichment types, each mapping to a Temporal workflow.
- A generic status cell and menu in the UI.

The phone provider waterfall (`phoneProviders/catalog.ts`) is already config-driven and can serve as the template.

**Acceptance criteria.** Adding a new enrichment means writing its workflow + activity and one registry entry. No new endpoint, columns or polling logic.

---

## P3: Nice to have

### IMP-15 · Enrichment audit trail and cost tracking

Store each provider call (who, when, which provider, result, cost) so we can show customers where a value came from, refund or bill accurately, and tune the waterfall order using real hit-rate and cost data. This builds on IMP-14.

### IMP-16 · Test coverage

Current tests cover the CSV parser, message generator and phone provider adapters. Missing:
- API integration tests (supertest against a test DB).
- Workflow tests with `@temporalio/testing` (timeouts, retries, provider fallthrough).
- A Playwright smoke test for import → enrich → generate message.

---

## Out of scope / decided not to do now

- **Microservices split** beyond API/worker (IMP-08): not justified at current scale.
- **Real-time push (WebSockets)**: targeted polling (IMP-06) covers the need for now. Revisit when we have collaborative features.
- **Replacing Temporal with a simple queue**: Temporal's retries, timeouts and visibility are exactly what the enrichment waterfall needs. Keep it.

## Suggested sequencing

1. **Sprint 1:** IMP-01, IMP-02, IMP-04, IMP-05, IMP-10. Cheap, high-leverage, and they stop bad data from getting in.
2. **Sprint 2:** IMP-03, IMP-07, IMP-08. Production readiness.
3. **Sprint 3:** IMP-06, IMP-09, IMP-11. Scale and visibility.
4. **Then:** IMP-12, IMP-13, IMP-14 together, since the enrichment framework is the natural moment to restructure the backend and the leads page.
