# ScaleMatrix API — TODO

Tasks are ordered. Only mark complete when acceptance criteria and verification pass.

- [ ] **P0 — Make the existing server test suite executable**
  - Acceptance: determine how the existing `tests/*.test.js` files are intended to run using the current dependency set/runtime.
  - Acceptance: `npm test` runs the real suite rather than the placeholder.
  - Acceptance: no new dependency is added without approval.
  - Acceptance: failures expose real product defects rather than being hidden/weakened.

- [ ] **P0 — Verify auth/session/tenant isolation**
  - Acceptance: registration/login/OAuth/refresh/logout/session invalidation have passing regression coverage.
  - Acceptance: cross-workspace access is rejected for workspace-scoped resources.
  - Acceptance: credentials/tokens are not leaked in logs or responses.

- [ ] **P0 — Verify integration connection lifecycle**
  - Acceptance: catalog, connect, status refresh, and disconnect contracts are tested.
  - Acceptance: duplicate connection creation and cross-tenant access are safely handled.
  - Acceptance: provider errors produce stable client-safe responses.

- [ ] **P1 — Dashboard contract/data integrity audit**
  - Acceptance: layout/metrics/widget-binding behavior is backend-driven and tenant-safe.
  - Acceptance: indexes/query patterns needed by current access paths are documented and verified.

- [ ] **P1 — Social publishing/webhook hardening audit**
  - Acceptance: OAuth state/callback behavior, webhook verification, idempotency, publishing, analytics sync, and inbox reply paths are reviewed/tested.
  - Acceptance: external side effects have explicit retry/idempotency semantics.

- [ ] **P1 — API documentation and operational readiness**
  - Acceptance: README documents setup, environment variables, run/test commands, health checks, and architecture.
  - Acceptance: errors/logging do not expose secrets.

- [ ] **P2 — Scale-readiness proposals (proposal only)**
  - Evaluate durable background jobs, caching, observability, provider rate-limit coordination, usage metering, and data-retention policies from measured needs.
  - Infrastructure/dependency changes require owner approval before implementation.
