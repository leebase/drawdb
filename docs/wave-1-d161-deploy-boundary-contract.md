# Wave 1 Remediation Contract: D161 Deploy Boundary

Date: 2026-09-04

Planning branch: `remediation/d161-deploy-boundary`

Frozen rejected source: `1a2079c2be2caadd2a159b9ae2c78228579a29cc`

## Decision

Wave 1 will remove the GUI **Deploy to Snowflake** capability and remove the
renderer-accessible `snowflake:execute-ddl` IPC route. It will retain DDL preview,
copy, and native `.sql` save/export; saved and Snowflake CLI profile discovery;
connection and disconnection; database/schema/table discovery; and Snowflake
reverse engineering.

The Electron-main Snowflake service's internal `executeDdl` method and the opt-in
live round-trip harness are not exposed to the renderer and will be left unchanged
in this wave. Hardening, redesigning, or running generic SQL execution is not part
of Wave 1.

## Starting and Preservation State

- Initial local branch: `s1-02-fk-direction`.
- Initial local HEAD: `1a2079c2be2caadd2a159b9ae2c78228579a29cc`.
- Initial status: clean, tracking `origin/s1-02-fk-direction`, ahead 0 / behind 0.
- `origin/s1-02-fk-direction`: `1a2079c2be2caadd2a159b9ae2c78228579a29cc`.
- `origin/main`: `d654b2dac0028b74d8cfecded61524f8400e2ba9`.
- The rejected commit exists locally, is eight commits and 44 changed files over
  the merge base `d654b2d`, and has subject `feat(remediation): implement S3-04
  non-stacking tables and S4-01 live Snowflake round-trip harness`.
- Remote annotated preservation tag:
  `rejected/s1-02-fk-direction-1a2079c`, peeled to the exact rejected SHA.
- New branch: `remediation/d161-deploy-boundary`, created from the exact rejected
  SHA, published to `origin`, and configured to track it.
- The rejected commit, its original branch, and its preservation tag must not be
  rewritten, amended, force-pushed, or deleted during remediation.

## Reproduced Baseline

All commands ran on the M5 MacBook Air from the clean remediation branch, without
Snowflake credentials or live Snowflake execution.

| Command | Exit | Exact result |
|---|---:|---|
| `npm run lint` | 0 | ESLint clean with `--max-warnings 0` |
| `npm test` | 0 | 177 tests, 28 suites, 176 pass, 0 fail, 1 skipped, duration 9461.659834 ms |
| `npm run test:user` | 0 | Desktop renderer and Electron builds succeeded; 5 tests, 1 suite, 5 pass, 0 fail, 0 skipped, duration 8268.126584 ms |

The desktop build emitted the existing dependency warning about direct `eval` in
`lottie-web` and the existing large-chunk warning. Neither failed the build.

## Current Trust-Boundary Map

1. `src/components/EditorHeader/Modal/Modal.jsx` displays
   `erd-deploy-ddl` beside the legitimate Copy DDL control and mounts
   `SnowflakeDeployModal`.
2. `src/components/SnowflakeDeployModal.jsx` discovers saved/CLI profiles,
   generates statement arrays, allows `replace: true` when **IF NOT EXISTS** is
   unchecked, connects, retains the returned session in component state, and
   calls `executeDesktopSnowflakeDdl({ sessionId, statements })`.
3. A profile selection change updates `profileId` but does not clear the retained
   session. A later deploy can therefore use the prior profile/account's session.
4. `src/erdTool/desktopBridge.js` forwards the renderer request to
   `window.drawdbDesktop.snowflake.executeDdl` without deriving SQL in a more
   trusted layer.
5. `src/electron/preload.ts` exposes `executeDdl` and invokes
   `snowflake:execute-ddl` with renderer-provided `sessionId` and `statements`.
6. `src/electron/main.ts` verifies that the caller is the trusted main frame, but
   then forwards the payload to `snowflakeService.executeDdl` without an SQL
   allowlist or operation-specific model validation.
7. `src/electron/snowflakeService.js` checks only payload shape and non-empty
   strings, then executes every supplied statement sequentially on the identified
   session. This permits arbitrary Snowflake SQL, including destructive SQL.

The same service separately owns the legitimate read path:
profile resolution -> connect and return a disposable opaque session -> list
databases/schemas/tables -> execute fixed metadata queries for reverse engineering
-> disconnect. Those methods use fixed SQL plus validated identifiers/binds and
must remain renderer-accessible.

## Allowed Files

Production changes are limited to:

- `src/components/SnowflakeDeployModal.jsx` — delete.
- `src/components/EditorHeader/Modal/Modal.jsx` — remove deploy import, state,
  button, and modal mount only; retain Code/DDL preview, Copy DDL, and save/export.
- `src/erdTool/desktopBridge.js` — remove only
  `executeDesktopSnowflakeDdl`.
- `src/electron/preload.ts` — remove only the Snowflake `executeDdl` method and
  increment `runtimeVersion` from 4 to 5 because the preload contract changes.
- `src/electron/main.ts` — unregister only `snowflake:execute-ddl`.

Test changes are limited to:

- `tests/electron-runtime.test.mjs`.
- `tests/interaction-user.test.mjs`.

`docs/wave-1-d161-deploy-boundary-contract.md` may be updated with verification
evidence. Any need to touch another production file stops implementation and
returns to supervisor review for a contract amendment.

## Exact Implementation Contract

### Remove

- Delete all GUI controls, state, imports, and component code for **Deploy to
  Snowflake**.
- Delete the renderer bridge export `executeDesktopSnowflakeDdl`.
- Delete the preload `snowflake.executeDdl` exposure.
- Delete the Electron-main `snowflake:execute-ddl` handler.
- Do not replace these with a generic query method, statement allowlist, confirmation
  dialog, feature flag, hidden control, or alternate IPC channel.

### Preserve

- Snowflake DDL generation used for preview/copy/save, including the visible and
  labelled **Copy DDL** action and native `.sql` export.
- Connection-profile CRUD and capability metadata, including the existing
  non-executing `connections:forward-engineer` validation/export flow.
- CLI and saved Snowflake profile discovery.
- `snowflake:connect`, `disconnect`, `list-databases`, `list-schemas`,
  `list-tables`, and `reverse-engineer` preload and IPC methods.
- Main-frame sender validation, opaque session IDs, credential isolation, error
  sanitization, and disconnect-on-window-close behavior.
- Existing internal `snowflakeService.executeDdl` and the skip-by-default live
  round-trip harness, unchanged and unreachable from renderer IPC.

### Tests

- Update the exact Electron IPC-handler inventory to prove
  `snowflake:execute-ddl` is absent while every read/profile/export handler remains.
- Update the exact frozen preload API inventory to prove `executeDdl` is absent,
  the retained Snowflake methods remain, and `runtimeVersion === 5`.
- Add a named D161 regression assertion that production main/preload/renderer
  bridge sources contain neither the removed execution channel nor its bridge
  method.
- Extend the existing Electron user flow so the Snowflake DDL modal still shows
  **Copy DDL** and does not show **Deploy to Snowflake**.
- Preserve the existing profile, connection, reverse-engineering, DDL export, and
  skip-by-default live-harness tests. Do not weaken, delete, or relabel them to get
  a green run.
- Required verification after implementation: `npm run lint`, `npm test`, and
  `npm run test:user`. Do not run `npm run test:live` in Wave 1.

## Explicit Non-Goals

- VECTOR semantics.
- CHECK constraints.
- Namespace fidelity or FK override correctness.
- `.erdproj` registration/open behavior.
- Dirty detection or save-state behavior.
- Broader web/Electron/installed-app acceptance-harness expansion.
- Unrelated UI polish.
- Live Snowflake execution.
- Redesign or hardening of generic SQL execution, the internal live-test helper,
  Terraform deployment, or Snowflake CLI deployment.
- Changes to `projectAdapter.js`, statement-generation semantics, profile/session
  architecture, connection storage, or metadata-query behavior.

## Rollback and Preservation

- The authoritative rejected snapshot is the peeled commit of remote tag
  `rejected/s1-02-fk-direction-1a2079c` and must remain available throughout.
- Wave 1 changes occur only on `remediation/d161-deploy-boundary`; no force push.
- Rollback is a normal revert of Wave 1 remediation commits, not a reset or rewrite
  of the rejected branch/tag.
- Generated build output and installed applications are not committed or replaced
  in this planning step.

## Definition of Done for Implementation

Wave 1 implementation is acceptable only when:

1. No Deploy-to-Snowflake control or deploy modal is reachable in the GUI.
2. The renderer, preload, and Electron main expose no Snowflake SQL-execution IPC.
3. Renderer-controlled strings cannot reach `snowflakeService.executeDdl` through
   an Electron IPC handler.
4. Copy/save DDL, profiles, connections, database/schema/table discovery, reverse
   engineering, and disconnect behavior remain covered and green.
5. The required three offline checks pass with exact results recorded; no live
   Snowflake call occurs.
6. The final diff is confined to the allowlist and contains no non-goal work.
7. An independent read-only reviewer inspects the diff and confirms the D161
   boundary before any merge recommendation.
8. The rejected commit and preservation tag still peel to
   `1a2079c2be2caadd2a159b9ae2c78228579a29cc`.

## Bounded Luna Worker Tasks

1. **Implementation worker:** apply only the removals and tests above on the
   remediation branch; no service/generator/profile changes and no live tests.
2. **Trust-boundary reviewer:** read-only review of the resulting renderer ->
   preload -> main graph, including source searches for alternate SQL execution
   routes and verification of the exact preload/handler inventories.
3. **Behavior-preservation reviewer:** read-only review of the focused UI and test
   diff; verify Copy DDL/native save and Snowflake read/reverse-engineering coverage
   remain intact and that no test was weakened.

The implementation task and final review tasks remain separate; the supervisor
owns contract changes, final diff review, evidence synthesis, and merge judgment.
