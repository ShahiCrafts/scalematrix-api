# ScaleMatrix API — Progress Log

## 2026-10-01 — Engineering foundation / baseline

### Done
- Established fresh repository baseline from the supplied project snapshot.
- Reviewed package/configuration, application middleware, central routing, domain models, services, and existing test files.
- Added engineering control documents: DESIGN.md, TODO.md, PROGRESS.md, DONE.md.
- Documented the current API surface, domain model, tenancy boundary, scaling direction, risks, and Definition of Done.

### Baseline verification
- `npm test`: **FAIL by configuration** — package script is the default placeholder (`Error: no test specified`) even though `tests/*.test.js` exists.
- Server lint: **not configured** in `package.json`.
- Existing tests must not be described as passing until the real runner is wired and executed.

### Decisions / constraints
- Existing `.env` is preserved unchanged.
- No dependencies were added/upgraded and no source files were deleted.
- New environment configuration, if required, goes only to `.env.example`.
- Material product/infrastructure changes will be proposed before implementation.

### Next
- P0: identify the intended runner for the existing test files using the current Node/dependency stack and make `npm test` execute the real suite without adding dependencies.

## 2026-10-02 — Dashboard contract/data-integrity audit

### Finding
- DashboardMetricService.resolveMetric is only partially backend-driven. Instagram follower/reach/recent-post values read workspace-scoped persistence, but growth score fallbacks, weekly performance, geographic reach, Gmail, Jira/Linear, GitHub, and Google Calendar metrics return fixed demo values.
- Because those fixed values are returned through the production dashboard API as normal metric data, the UI cannot distinguish measured workspace data from placeholders. This violates the P1 dashboard acceptance criterion and risks presenting fabricated operational data to users.
- The controller's primary layout/update queries are scoped by both workspaceId and userId; no cross-workspace write path was found in this focused controller review.

### Required correction
- Production metric responses must come from workspace-scoped persisted/provider data, or return an explicit unavailable/empty state when no real measurement exists.
- Do not silently substitute realistic-looking sample values for missing provider data.
- Add regression coverage proving missing data is represented as unavailable and that metric queries remain workspace-scoped.

### Verification status
- Audit complete; source correction is not marked complete until regression tests execute successfully.
