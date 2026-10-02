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


## 2026-10-02 — P0 integration tenant-isolation audit

### Finding
- Integration routes authenticate the user, but `integrationController` passes `req.user._id` into the Composio service as the tenant identifier.
- `ComposioService` then stores that user id in `Connection.workspaceId`, even though the model declares `workspaceId` as a reference to `Workspace` and onboarding establishes `user.activeOrganization` as the active workspace.
- This makes integration ownership user-scoped instead of workspace-scoped and breaks the documented tenant boundary for shared workspace members.

### Planned correction
- Derive the tenant from the authenticated user's active workspace and keep `connectedBy` as the authenticated user id.
- Reject integration operations when no active workspace is available rather than silently substituting the user id.
- Add regression coverage proving connection queries cannot cross workspace boundaries.

### Verification status
- No source fix is marked complete yet. A focused branch `fix/integration-workspace-isolation` was created from `main` for the correction.


### 2026-10-02 follow-up
- Attempted the focused controller correction to derive integration tenancy from `req.user.activeOrganization` while retaining `req.user._id` as the actor/`connectedBy` identity.
- The repository write was blocked by the connected write safety layer. No source change or verification result is claimed.
- This write path has reached its retry cap for the current issue; continue with the next non-blocked task rather than repeating it.
