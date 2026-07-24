# drawDB Desktop Snowflake Sprint Plan

## Sprint Strategy

This plan is designed for hourly autonomous progress. Each cycle should complete one small, testable increment from the current sprint queue. Ideation is constrained: choose from the listed sprint items, do not invent broad new directions.

## Definition Of Done For Any Code Cycle

A code cycle is done only when it records:

- changed files
- user-visible behavior added or preserved
- tests/checks run
- remaining risk
- next sprint item

Preferred checks:

```bash
npm run test
npm run lint
npm run build
```

Add Electron-specific smoke checks once Electron exists.

## Current Sprint Queue

### SS-001: Lock Desktop App Architecture

Status: complete (2026-07-14)

Objective: create the app-level architecture contract for Electron, renderer/main boundaries, Snowflake metadata access, project files, and no-web-server delivery.

Acceptance:

- Architecture doc exists in `docs/desktop-app-architecture.md` or equivalent.
- It states Electron is the first implementation path.
- It states delivered app must not require a local web server.
- It states Python is reference/proof only, not a runtime dependency.
- It states existing drawDB functionality must be preserved.

Closure evidence: `docs/desktop-app-project-plan.md` assigns Electron main,
preload, renderer, shared-core, native-file, credential, offline, and
cross-platform ownership; it also defines the direct bundled-asset launch path
and explicitly separates development/test Python and Vite harnesses from the
desktop runtime. On 2026-07-14, the deterministic SS-001 matrix checks and
`npm run test`, `npm run lint`, and `npm run build` passed. The pinned smoke
manifest remains web-baseline evidence only; executable Electron launch proof
is intentionally deferred to SS-002 and SS-003.

### SS-002: Scaffold Electron Without Breaking Web Build

Status: complete (2026-07-14)

Objective: add the smallest Electron shell that loads the built drawDB renderer.

Acceptance:

- `npm run build` still works.
- New Electron dev/start command exists.
- App opens directly to the editor or a desktop start route.
- No local HTTP server is required for packaged mode.
- Existing web/Vite dev workflow remains usable.

Closure evidence: SS-002 is complete only because all three preceding gates
passed: the implementation gate recorded `npm run verify:ss002` passing; the
web-preservation smoke in `artifacts/user-smoke/result.json` records
`app_started: true`, `core_flow_completed: true`, `check_exit_code: 0`, and no
blocking errors; and `code-reviews/review-ss-002-reconciliation.verdict.json`
records the structured review verdict `pass`. The closeout is recorded in
`artifacts/ss-002-acceptance-report.md`. This status does not claim native file
IPC, Snowflake integration, packaging, or any other later sprint work. The
Medium local-navigation containment finding `SS002-REC-001` remains a tracked
hardening follow-up but did not overturn the review verdict. Routing
compatibility evidence already completes SS-003, so the next recommended
sprint item is SS-004: Native Project File Bridge.

### SS-003: Desktop Routing And App Entry

Status: complete (2026-07-14)

Objective: make the renderer work under Electron file/custom protocol loading.

Acceptance:

- Routing works without loopback HTTP.
- App opens the editor by default.
- Landing-page/web-only assumptions are isolated or bypassed for desktop mode.
- Existing browser routes are not broken unless intentionally gated.

Closure evidence: `tests/electron-runtime.test.mjs` asserts file-url desktop
windows use `HashRouter`, browser builds retain `BrowserRouter`, desktop assets
are relative file assets, `src/utils/openRoute.js` produces hash-safe desktop
route URLs, and Electron loads `dist-desktop/index.html` with `{ hash:
"/editor" }`. This routing work is considered complete for sprint selection;
future work should move to native desktop capabilities rather than duplicating
the routing scaffold.

## SS-002 Reconciliation

Acceptance criteria examined: `npm run build` still works; a new Electron
dev/start command exists; the app opens directly to the editor or a desktop
start route; packaged/production mode does not require a local HTTP server; and
the existing web/Vite dev workflow remains usable. Evidence paths examined:
`package.json`, `vite.electron.config.js`, `tests/electron-runtime.test.mjs`,
`tests/smoke_manifest.json`, `src/electron/main.ts`,
`src/electron/preload.ts`, `src/App.jsx`, and `src/utils/openRoute.js`.
`package.json` keeps `dev: vite` and `build: vite build`, adds
`build:desktop-renderer`, `build:electron`, `build:desktop`,
`start:electron`, `test:electron`, and `verify:ss002`, and points Electron at
`dist-electron/main.cjs`. `src/electron/main.ts` creates a sandboxed isolated
window, loads `dist-desktop/index.html` via `loadFile(..., { hash: "/editor" })`,
does not call `loadURL`, and does not start Vite, preview, Python, or loopback
network modules. `vite.electron.config.js` builds separate `main.cjs` and
`preload.cjs` artifacts, while `src/electron/preload.ts` exposes only a frozen
runtime marker. `tests/electron-runtime.test.mjs` proves the Electron entries,
scripts, local file startup, no-server production harness, security flags,
narrow preload, relative desktop assets, and isolated Electron artifacts. It
also records already completed SS-003 routing evidence through `HashRouter` and
hash-safe desktop links; that routing evidence is not a remaining SS-002 gap.
`tests/smoke_manifest.json` remains web-baseline evidence only and is not used
to claim Electron runtime behavior. Exact check rerun on 2026-07-14 during
SS-002 reconciliation:
`npm run verify:ss002`. Result: passed, including `npm run test` with 3/3 test
files passing, `npm run lint`, `npm run build`, `npm run build:desktop-renderer`,
and `npm run build:electron`. The Vite build emitted existing warnings about
direct eval in `lottie-web` and large chunks, but exited successfully. Remaining
gaps after SS-002 are native project file IPC, native save/open workflows,
Snowflake desktop bridges, and installer packaging; these belong to later SS
items and do not block SS-002. SS-002 is complete. Because SS-003 routing is
also already complete, the next eligible sprint item is SS-004: Native Project
File Bridge.

### SS-004: Native Project File Bridge

Status: complete (2026-07-14)

Objective: add safe Electron IPC for native New/Open/Save/Save As for ERD project files.

Acceptance:

- Renderer cannot access arbitrary Node APIs.
- Preload exposes a narrow project-file bridge.
- Open reads `.erd.json` / `.json` into the editor.
- Save writes the current project through a native dialog.
- Recent file metadata is stored locally and does not pollute project files.

Closure evidence: supervised recovery lineage from failed run `432088b78795`
completed in governed run `da81f213113a`. The final tree passed all 80 product
tests, lint, web and desktop builds, and the governed user-smoke gate. Independent
review recorded `pass` with zero High or Critical findings, and
`verify-run-evidence` verified 3 evidence entries and 13 artifacts. The bridge
keeps filesystem/dialog ownership in Electron main, exposes fixed preload
operations, normalizes validated project JSON before persistence, rejects
credential-bearing structures without rejecting legitimate Snowflake names,
tracks native dirty/saved ownership, and supports offline reopen. SS-005 is next.

### SS-005: Snowflake DDL Export Bridge

Status: queued

Objective: convert Snowflake DDL preview/export into a native desktop workflow.

Acceptance:

- Current diagram can render Snowflake DDL.
- Export writes `.sql` via native dialog.
- Errors are shown as UI messages, not console-only failures.
- Existing drawDB export options remain available.

### SS-006: Auto-Arrange As First-Class Desktop Command

Status: queued

Objective: keep the ELK auto-arrange feature visible and usable from desktop menus/toolbars.

Acceptance:

- Auto-arrange remains available in the editor toolbar.
- A desktop menu command or keyboard-accessible action invokes it.
- It works after opening/importing a project.
- Test coverage protects at least the layout adapter contract.

### SS-007: TypeScript Snowflake Core Parity

Status: queued

Objective: move durable Snowflake model validation and DDL generation behavior into TypeScript product code, using Python as reference.

Acceptance:

- Snowflake DDL generation is covered by focused JS tests.
- Constraint semantics match the proven Python behavior for supported cases.
- Unsupported features fail loudly.
- Existing project adapter tests pass.

### SS-008: Snowflake DDL Import Integration

Status: queued

Objective: integrate Snowflake DDL text/file import into drawDB's normal import surface.

Acceptance:

- Snowflake is selectable from import SQL workflows.
- Import creates editable tables/relationships for supported DDL.
- Unsupported syntax produces clear errors.
- Existing SQL imports for other databases are not broken.

### SS-009: Mocked Snowflake Metadata Reverse Engineering

Status: queued

Objective: build the metadata-to-diagram seam before live connection work.

Acceptance:

- A fixture representing Snowflake INFORMATION_SCHEMA metadata converts into a diagram/project.
- Columns, tables, constraints, comments, and relationships are represented where available.
- Tests run without credentials.
- Output can be opened in the editor and auto-arranged.

### SS-010: Live Snowflake Connection Prototype

Status: queued

Objective: use Electron main process and Snowflake Node driver to connect read-only and list metadata.

Acceptance:

- Connection code runs only in Electron main process.
- Secrets are not written to project files.
- User can test connection and list databases/schemas/tables.
- Failure modes are user-readable.
- Mocked tests remain the primary CI gate.

### SS-011: Live Snowflake Reverse Engineering Flow

Status: queued

Objective: let the user select Snowflake objects and import them into the editor.

Acceptance:

- Select database/schema/tables.
- Import metadata into editable diagram.
- Auto-arrange works after import.
- Save project works offline after import.
- Export DDL works from the imported model.

### SS-012: Cross-Platform Packaging

Status: in progress (0.1.0 Windows artifact repair verified 2026-07-24; macOS 0.1.0 rebuild/smoke still pending)

Objective: produce unsigned installable packages for macOS, Linux, and Windows.

Acceptance:

- macOS package builds.
- Linux AppImage builds.
- Windows installer or portable build is configured.
- Each package has a smoke checklist.
- License/about/source notice requirements are visible.

Configuration evidence: `package.json` configures `electron-builder` with
macOS `.dmg` and `.zip` targets for arm64 and x64, an x64 Linux AppImage, and
distinct x64 Windows NSIS and portable targets while preserving
`main: dist-electron/main.cjs` and the existing renderer/Electron entry build
scripts. Separate `-setup.exe` and `-portable.exe` artifact templates prevent
the two Windows targets from colliding. Installer scripts run `build:desktop`,
explicitly disable publishing, and keep macOS signing disabled. The installer
file set includes `dist-desktop`, `dist-electron`, `package.json`, `LICENSE`,
`README.md`, and `THIRD_PARTY_NOTICES.md`; the same notice files are copied as
extra resources. The 2026-07-15 repair replaced the wide `drawdb.png` logo as a
Linux packaging icon with native app icon resources: `build/icon.png`,
`build/icon.ico`, and `build/icon.icns`, wired through
`package.json#build.directories.buildResources`, `build.mac.icon`,
`build.linux.icon`, and `build.win.icon`. `tests/cross-platform-packaging.test.mjs`
now verifies those icon formats and dimensions. Packaged startup therefore
continues to load bundled local files and does not require Python, Vite
preview, or a local web server. The platform-specific smoke checklist and
license/source notice requirements are recorded in
`docs/desktop-app-project-plan.md`.

Changed files for the 2026-07-24 0.1.0 packaging slice:
`package.json`, `package-lock.json`, `tests/cross-platform-packaging.test.mjs`,
`.gitignore`, and `docs/desktop-app-sprint-plan.md`. `package.json` and
`package-lock.json` now use release identity `0.1.0`. `package.json` also sets
`build.linux.syncDesktopName` to `true` while preserving the existing macOS
DMG/ZIP targets, Linux x64 AppImage target, Windows x64 NSIS target, and
Windows x64 portable target. `.gitignore` now treats `dist-installers` as
generated packaging output, matching the Electron Builder output directory.

`tests/cross-platform-packaging.test.mjs` now proves the `0.1.0` identity in
both package files, the Linux `syncDesktopName: true` setting, the preserved
Linux AppImage target, the preserved Windows x64 NSIS and portable target
configuration, and the required real Windows artifact paths:
`dist-installers/drawDB Desktop-0.1.0-win-x64-setup.exe` and
`dist-installers/drawDB Desktop-0.1.0-win-x64-portable.exe`. The Windows
artifact assertions require non-trivial `.exe` files with Windows executable
headers. The trusted governed-run failure `8623e2b43bad` was the final
Windows artifact assertion: `fs.statSync` could not find
`dist-installers/drawDB Desktop-0.1.0-win-x64-setup.exe`. The current
packaging evidence includes that NSIS installer and the portable executable
under the existing `dist-installers` layout.

Exact checks run for the 2026-07-24 0.1.0 packaging slice:
`test -s 'dist-installers/drawDB Desktop-0.1.0-linux-x86_64.AppImage' && file
'dist-installers/drawDB Desktop-0.1.0-linux-x86_64.AppImage' && ls -lh
'dist-installers/drawDB Desktop-0.1.0-linux-x86_64.AppImage'` passed and
verified the existing Linux AppImage as a 174 MB x86-64 ELF executable. Linux
was not rebuilt. macOS was not rebuilt. The focused package verification
`node --test tests/cross-platform-packaging.test.mjs` passed after confirming
both real Windows x64 outputs:
`dist-installers/drawDB Desktop-0.1.0-win-x64-setup.exe` and
`dist-installers/drawDB Desktop-0.1.0-win-x64-portable.exe`.

Windows status: repaired for the SS-012 focused artifact gate. The remaining
SS-012 risk is macOS 0.1.0 native rebuild and host smoke evidence, because the
available macOS artifacts in `dist-installers` were generated before the
0.1.0 identity update and were not rebuilt during this repair.

### SS-013: Persistent Multi-Database Connections Menu

Status: complete (governed run `c2c7e492126b`, 2026-07-20)

Objective: replace the single-purpose Snowflake connection dialog with a
persistent, DBeaver-style Connections menu that manages saved connection
profiles for every database backend the app already supports, reusable for
both reverse engineering (import) and forward engineering (deploy/export
DDL). This generalizes existing connection handling; it does not add a new
database provider.

Acceptance:

- A "Connections" item exists in the Electron application menu bar alongside
  File/Edit/Diagram/View/Help.
- Connection profiles persist locally across app restarts. Secrets use the
  same OS-backed secure storage already used for Snowflake credentials;
  credentials are never written to `.erd.json` project files.
- Profiles are provider-typed. Snowflake and SQLite are the supported
  provider types, built on the existing provider logic — no new database
  provider is introduced.
- A saved connection can be used both to reverse engineer (pull schema
  metadata into an editable diagram) and to forward engineer (deploy
  generated DDL back to that connection) where the provider supports each
  direction.
- Users can add, edit, duplicate, test, and delete a connection profile from
  the Connections menu.
- Existing Snowflake reverse-engineering and DDL export workflows keep
  working, now routed through a saved connection profile instead of the
  standalone one-off dialog.
- Test coverage protects profile CRUD, persistence, and the reverse/forward
  hand-off for at least the Snowflake provider, using mocked metadata by
  default (no live credentials required).

### SS-014: Conversational Schema Authoring

Status: complete (rebuilt locally from source and reverified, 2026-07-24;
original production-provider repair run `d347c5273564`, 2026-07-20)

Objective: let a user describe a data model in natural language and receive a
visible, editable proposal for tables, columns, keys, and relationships before
the canonical model is changed.

Acceptance:

- A docked conversational panel accepts natural-language schema requests.
- Proposed additions and changes render as pending canvas diffs with explicit
  Accept, Edit, and Reject actions; no LLM response silently mutates the model.
- Accepted proposals participate in normal undo/history and dirty/save state.
- The production desktop LLM path crosses an allowlisted Electron IPC/preload
  boundary.
- The user can configure the supported LLM API key, and Electron `safeStorage`
  owns its encrypted lifecycle. The key never enters project files, renderer
  persistence, logs, fixtures, or snapshots.
- Offline and provider-error behavior fails safely without corrupting the
  current diagram.
- Deterministic mocked-provider tests, the full test suite, lint, build, user
  smoke, and independent review all pass.

Rebuild evidence (2026-07-24):

- Recreated the logical proposal contract, bounded prompt/request builder,
  OpenAI Responses API service with strict Structured Outputs, encrypted
  `safeStorage` credential lifecycle, allowlisted Electron bridge, docked
  proposal UI, pending canvas diff, explicit Accept/Edit/Reject flow, and
  undo/redo integration.
- Verification passed with 146/146 automated tests, ESLint, the production
  desktop renderer and Electron builds, the real browser workflow, a packaged
  Electron UI smoke, credential-pattern scanning, and `git diff --check`.

### SS-015: Terraform Round-Trip Engineering

Status: complete (2026-07-24)

Objective: add Terraform as a first-class interchange path so supported
database structures can be reverse engineered from Terraform HCL into an
editable ERD and forward engineered from the canonical model into
deterministic Terraform HCL.

Acceptance:

- The desktop app can select a Terraform file or module directory and import
  supported database resources into the canonical physical model and editable
  diagram.
- Import preserves supported namespaces, tables, ordered columns, primary and
  unique keys, foreign keys, and derived relationships.
- The app can generate deterministic Terraform HCL from the current canonical
  model without bypassing the canonical-model validation boundary.
- A canonical model exported to Terraform and imported again preserves all
  supported semantics in deterministic fixture tests.
- Unsupported resources, expressions, or ambiguous references produce clear,
  actionable errors; they are never silently dropped.
- Generated Terraform is previewed and saved for user review. ERD Tool does
  not automatically run `terraform apply`.
- Terraform state, provider credentials, backend secrets, and tokens never
  enter `.erd.json` files, logs, fixtures, or generated test snapshots.
- Existing database connection, LLM schema-authoring, Snowflake, SQLite,
  project-file, and DDL workflows remain green.

Closure evidence: `src/erdTool/terraformRoundTrip.js` provides deterministic
Snowflake Terraform HCL reverse engineering into the canonical physical model
and editable drawDB diagram, plus deterministic forward engineering from the
validated canonical model back to Terraform HCL. The supported Terraform
surface is intentionally constrained to Snowflake databases, schemas, tables,
columns, primary keys, unique keys, and foreign keys; unsupported resources,
unsupported expressions, ambiguous references, provider credential blocks,
backend/state configuration, and `.tfstate`-like JSON are rejected explicitly.
The 2026-07-24 repair also fixed Terraform default expression classification,
escaped Terraform template markers in generated strings, rejected Terraform
Cloud state configuration, removed `.tfvars` from the upload affordance,
resolved schema database references independent of declaration order, rejected
explicit table database/schema mismatches, rejected non-string HCL literals in
string-only Terraform attributes, rejected unsupported nested default and
foreign-key property block content, and applies the imported Snowflake database
so Terraform export is reachable after Terraform import.
The existing import/export UI exposes Snowflake Terraform source import and
Terraform HCL export without invoking Terraform or persisting state,
credentials, backend secrets, or tokens. During closure, Electron process
bundling was also repaired so `node:process` and `node:buffer` remain external
Node modules instead of browser shims in the production main artifact. Exact
checks run from the repository root: `node tests/terraform-round-trip.test.mjs`,
`node tests/electron-runtime.test.mjs`, `npm run test`, `npm run lint`,
`npm run build`, and `npm run
build:desktop`; all passed. `npm run build` and `npm run build:desktop`
retained the existing Vite warnings for `lottie-web` direct eval and large
chunks. Current structured repair evidence is recorded in
`code-reviews/review-ss-015-terraform-repair.verdict.json`. No later sprint item
is defined in this plan yet.

## Sprint Boundaries

### Sprint 1: App Shell

Items: SS-001, SS-002, SS-003

Goal: a desktop app launches without a web server.

### Sprint 2: Native Files And DDL

Items: SS-004, SS-005, SS-006

Goal: normal desktop project workflows replace browser/manual file handling.

### Sprint 3: Snowflake Core

Items: SS-007, SS-008, SS-009

Goal: Snowflake behavior is product code and testable without Python or credentials.

### Sprint 4: Live Snowflake Reverse Engineering

Items: SS-010, SS-011

Goal: connect to Snowflake and reverse engineer selected metadata into an editable ERD.

### Sprint 5: Installers

Items: SS-012

Goal: produce installable app artifacts for Mac, Linux, and Windows.

### Sprint 6: Persistent Connections

Items: SS-013

Goal: a DBeaver-style Connections menu manages reusable, persisted connection
profiles across all supported database providers for both reverse and
forward engineering.

### Sprint 7: Conversational Schema Authoring

Items: SS-014

Goal: natural-language requests produce safe, reviewable diagram changes with
secure local LLM credential handling.

### Sprint 8: Terraform Round-Trip Engineering

Items: SS-015

Goal: supported database structures round-trip between Terraform HCL and the
canonical editable ERD without leaking credentials or applying infrastructure.

## Ideation Rules For Auto-Orch

During hourly runs:

1. Generate at most three candidates.
2. Every candidate must map to exactly one SS item.
3. Prefer the earliest active or queued SS item whose dependencies are met.
4. Do not propose new database providers.
5. Do not propose a new editor framework.
6. Do not replace Electron unless an implementation blocker proves Electron is not viable.
7. Do not create marketing collateral.
8. Do not create broad product research unless a current SS item is blocked by a concrete decision.
9. If a useful idea does not map to an SS item, record it in a parking-lot note and continue the sprint.
10. No more than one consecutive planning-only cycle is allowed.

## Human Decision Gates

Ask Lee before:

- changing away from Electron
- removing existing drawDB functionality
- introducing a required Python runtime
- introducing a cloud service
- storing credentials outside OS-backed secure storage
- publishing/distributing externally
- changing license posture
- adding paid services or signing/notarization work
