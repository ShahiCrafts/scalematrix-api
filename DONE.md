# ScaleMatrix API — Definition of Done

- [ ] All committed product features have documented acceptance criteria and are satisfied.
- [ ] `npm test` executes the real suite and all tests pass.
- [ ] Auth/session lifecycle and tenant isolation have passing regression coverage.
- [ ] Integration/social side effects have safe error, authorization, and idempotency behavior.
- [ ] API contracts consumed by the web client are documented and verified.
- [ ] Server starts cleanly with documented configuration and health endpoint behavior.
- [ ] No known unhandled high-severity security issue remains.
- [ ] No secrets are committed; existing `.env` is untouched and new keys are documented in `.env.example` only.
- [ ] Logging/error responses avoid credentials, tokens, stack traces, and sensitive provider data.
- [ ] README/docs cover setup, environment, architecture, API surface, test commands, and operational assumptions.
- [ ] TODO has no unresolved P0/P1 product-quality tasks or unapproved blockers.
- [ ] Final full verification is recorded in PROGRESS.md.
