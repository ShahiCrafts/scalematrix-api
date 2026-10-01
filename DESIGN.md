# ScaleMatrix API — Design & Architecture

## Purpose
ScaleMatrix API is the Express/MongoDB backend for a multi-workspace social-media growth platform. It owns identity/session lifecycle, workspace onboarding, integrations, social account operations, dashboard data, subscriptions/entitlements, and AI chat orchestration.

## Architecture
- **Runtime:** Node.js, CommonJS.
- **HTTP:** Express 5 with centralized `/api/v1` routing.
- **Persistence:** MongoDB through Mongoose.
- **Validation:** Zod request schemas/middleware.
- **Security middleware:** Helmet, CORS, rate limiting, cookie parsing, Mongo sanitization, JWT authentication.
- **External integration layer:** Composio plus social provider abstractions.
- **Service pattern:** controllers delegate domain behavior to services; Mongoose models own persistence shape.

## Domain Model
Core identity/tenancy:
- `User`, `Workspace`, `Membership`, `Invite`, `OTP`, `RefreshToken`

Commercial/entitlement:
- `Plan`, `Subscription`, `Invoice`, `UsageCounter`, `ApiKey`

Integration/social:
- `AppProvider`, `Connection`, `ConnectionCredential`, `SocialAccount`, `SocialPost`, `SocialInsight`, `SocialInbox`, `WebhookLog`

Automation/AI/operations:
- `Workflow`, `WorkflowRun`, `Thread`, `ToolCallLog`, `Notification`, `AuditLog`

Dashboard composition:
- `DashboardLayout`, `WidgetDefinition`, `WidgetBinding`

All workspace-scoped data must enforce tenant isolation. Workspace/user identifiers are security boundaries, not merely filters.

## API Contracts
Base: `/api/v1` unless stated otherwise.

### Health
- `GET /health` — service/database state.

### Auth `/auth`
- `POST /register`
- `POST /verify-otp`
- `POST /resend-otp`
- `POST /login`
- `POST /google`
- `POST /github`
- `POST /refresh`
- `POST /logout`
- `GET /me` — authenticated user.

### Onboarding `/onboarding`
- `POST /setup`
- `POST /invites`
- `GET /status`

### Integrations `/integrations`
- `GET /catalog`
- `GET /shortlist`
- `GET /connections`
- `POST /connect`
- `POST /disconnect`
- `POST /refresh-status`

### Social `/social`
- `GET|POST /webhooks/meta`
- `GET /oauth/:provider/callback`
- `GET /oauth/url`
- `GET /accounts`
- `DELETE /accounts/:accountId`
- `POST /publish`
- `GET /posts`
- `GET /analytics/:accountId`
- `POST /analytics/:accountId/sync`
- `GET /inbox/:accountId`
- `POST /inbox/items/:itemId/reply`

### Dashboard `/dashboard`
- `GET /layout`
- `GET /metrics`
- `PUT /widget-bindings/:bindingId`

### Subscription `/subscription`
- `GET /me`

### Chat
- `POST /api/v1/chat`
- `POST /api/v1/chat/title`
- Legacy/direct mount also exists at `/api/chat`; this duplicate surface should be reviewed before removal because deletion/contract changes require approval.

## Cross-cutting Contract Rules
- Controllers return the existing API response/error envelope consistently.
- Authenticated workspace operations must derive/validate tenant context server-side.
- Secrets/credentials must never be returned in API responses or logged.
- External provider callbacks/webhooks require explicit authentication/signature/state validation appropriate to the provider.
- Contract changes are made here first and then consumed by the web client.

## Scaling Direction
Scale first by preserving stateless HTTP handlers, indexing tenant/time/provider query paths, making external side effects idempotent, and moving scheduled/long-running provider work behind durable job execution when volume requires it. Do not introduce queues/caches/new infrastructure until measured need and owner approval.

## Known Gaps / Risks
1. `npm test` is still the package placeholder and exits 1 even though a `tests/` suite exists; test execution must be wired using the existing stack or explicitly approved tooling.
2. No lint script is defined for the server.
3. Duplicate chat mounts (`/api/v1/chat` and `/api/chat`) increase contract surface.
4. Tenant isolation, credential encryption, webhook idempotency/signature validation, session invalidation, and authorization need continuous regression coverage.
5. README/setup documentation is absent at the server root.
6. Full integration tests may require MongoDB/external-service configuration; tests must isolate or clearly document those dependencies.

## Change Rules
- Small, reversible changes; tests are the completion gate.
- No dependency additions/upgrades, stack changes, or file deletion without approval.
- Existing `.env` remains untouched; new configuration is documented only in `.env.example`.
- Material product or infrastructure changes are proposed before implementation.
