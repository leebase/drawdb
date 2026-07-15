# drawDB Desktop Snowflake Project Plan

## Product Name

Working name: **drawDB Desktop**.

Product description: an installable desktop version of drawDB that preserves drawDB's existing database modeling capabilities and adds first-class Snowflake support, including auto-arrange, forward engineering, reverse engineering, and native desktop file workflows.

## End State

Deliver an installable ERD application for:

- macOS
- Linux
- Windows

The delivered app must not require a local web server, Python runtime, command-line startup, or manual browser launch. It should feel like a normal desktop database modeling tool.

## Product Positioning

This is not a separate Snowflake-only ERD tool. The product is drawDB with Snowflake support added.

The app should preserve the useful functionality drawDB already provides:

- visual ERD editing
- existing supported database targets
- existing SQL import/export workflows where they work
- DBML/Mermaid/image/documentation export surfaces where already supported
- browser/editor interaction patterns that are useful

Snowflake should become another first-class database target rather than a side-channel bolted onto the editor.

## Primary Goals

1. Package drawDB as a desktop application.
2. Keep normal use offline-first.
3. Remove the current janky workflow of building a web app, running a local server, opening a browser, and moving JSON files by hand.
4. Preserve all existing drawDB functionality unless a removal is explicitly approved.
5. Add Snowflake as a first-class target for modeling, import, export, and live metadata reverse engineering.
6. Keep auto-arrange as a first-class feature.
7. Produce cross-platform installers.

## Non-Goals

- Do not build a new ERD editor from scratch.
- Do not make Snowflake the only supported database.
- Do not require a hosted cloud service.
- Do not require a web server in the installed app.
- Do not require Python in the installed app unless a later explicit decision accepts that tradeoff.
- Do not add unrelated database providers before Snowflake desktop parity is complete.
- Do not create marketing pages, landing pages, or sales collateral as autonomous product cycles.

## Current Assets

### drawDB Fork

The drawDB fork already contains the product UI foundation:

- React/Vite editor
- existing database target list
- import/export panels
- diagram canvas and editing model
- local browser persistence
- `src/erdTool/projectAdapter.js`
- `src/erdTool/elkLayout.js`
- `src/components/ErdToolActions.jsx`
- Snowflake database option
- Snowflake DDL preview/export path through the ERD Tool adapter
- auto layout via `elkjs`

### ERD Tool Python Reference

The Python `erd-tool` project is a reference/proof harness, not the delivered product:

- canonical physical model rules
- strict project serialization
- SQLite schema import
- constrained Snowflake DDL import/render
- offline fixtures
- Snowflake structural proof using Chinook
- tests proving edge cases and Snowflake semantics

The durable ideas in Python should be ported or reimplemented in TypeScript/Electron where needed. The shipped desktop app should not depend on running Python commands.

## Electron Desktop Architecture

Use **Electron first**.

Rationale:

- drawDB is already a React/Vite application.
- Electron can package the existing UI with minimal disruption.
- Electron main process can use Node APIs for filesystem, native menus, secure storage, and Snowflake connectivity.
- Electron avoids browser CORS/security limits for live Snowflake metadata access.
- Electron-builder can produce macOS, Linux, and Windows installers.

Tauri can be reconsidered after the Electron MVP if installer size, memory footprint, or security posture becomes a material issue.

Electron is the desktop shell around drawDB, not a replacement product or a second editor. The existing React/Vite drawDB application remains the user-facing editor and continues to own diagram creation, editing, import/export surfaces, and auto-arrange. The desktop target adds operating-system integration through isolated Electron processes while preserving the current web target from the same renderer feature tree. Shared, deterministic model and layout behavior moves toward TypeScript modules that can run in either target; it must not acquire an Electron, web-server, Snowflake-driver, or Python dependency.

The installed application is offline-capable for normal modeling: users can create, edit, auto-arrange, open, save, and export local projects without a network connection. A future live database operation may require a network connection, but loss of connectivity must not prevent reopening a previously saved project or using the editor. macOS, Windows, and Linux follow the same process boundary and project format. Platform-specific dialogs, credential backends, menus, signing, and package formats are adapters around that common architecture; producing installers remains SS-012 rather than part of SS-001.

## Target Architecture

```text
drawdb/
  electron/
    main.ts              # app lifecycle, windows, menus, IPC
    preload.ts           # safe renderer bridge
    snowflake/           # Node-side Snowflake metadata access
    file-system/         # native open/save/export dialogs
  src/
    ...existing drawDB React app...
    erdTool/
      core/              # TypeScript canonical model and validation
      snowflake/         # Snowflake DDL import/export and metadata mapping
      layout/            # ELK auto-arrange integration
      desktopBridge.ts   # renderer calls to Electron APIs
```

## Electron Process Ownership

Electron is the first implementation path, but the shell must remain a thin host around the existing drawDB React editor. `electron/main.ts` owns application lifecycle, `BrowserWindow` creation, native menus, trusted custom-protocol or packaged-file loading, native dialogs, recent-file metadata, operating-system credential access, and Snowflake driver calls. Main is the only process allowed to use Node filesystem, credential, or database APIs. It must never accept executable code or arbitrary Node module requests from renderer input.

`electron/preload.ts` owns the isolated bridge. It uses `contextBridge` to expose a frozen, versioned API made only of typed request and response DTOs; it does not expose `ipcRenderer`, `require`, filesystem primitives, environment variables, or a generic `invoke(channel, payload)` escape hatch. The window is created with `contextIsolation: true`, `nodeIntegration: false`, and sandboxing enabled where compatible with the required preload bridge.

The renderer remains the existing code under `src/`: it owns visual editing, React state, validation presentation, DDL preview, project serialization requests, user-visible errors, and invocation of the existing ELK auto-arrange behavior. Renderer code can request native actions through a future `src/erdTool/desktopBridge.ts`, but it cannot choose arbitrary filesystem paths or connect directly to Snowflake. Auto-arrange must remain a renderer-visible drawDB command; applying layout updates table coordinates while preserving table and field identity, relationships, model semantics, and the separately serialized viewport/layout state.

Shared TypeScript under future `src/erdTool/core`, `src/erdTool/layout`, and related provider-neutral modules owns deterministic, environment-independent model validation, diagram conversion, project serialization contracts, layout contracts, and DDL rendering. These modules must not import Electron, Node-only APIs, browser globals, credentials, or Python. The existing `src/erdTool/projectAdapter.js` and `src/erdTool/elkLayout.js` are current JavaScript seams to preserve and may be migrated incrementally rather than rewritten during SS-001. Main owns native Open, Save, Save As, and export dialogs plus actual file reads and atomic writes; renderer owns the model being requested for save and the user-visible result. The preload bridge carries only validated data transfer objects between them.

## IPC and Credential Security

Desktop IPC is an allowlist of narrow operations such as `project:open`, `project:save`, `ddl:export`, `snowflake:profile:list`, `snowflake:connection:test`, and `snowflake:metadata:read`. Each channel has a TypeScript request and response type plus runtime schema validation in main; unknown fields, oversized payloads, invalid identifiers, and invalid state transitions are rejected. Open and save paths originate from a main-owned native dialog or a main-owned recent-file record, never from an unrestricted renderer path. Errors returned to the renderer are stable, sanitized application errors and must not include secrets, connection strings, stack traces containing credentials, or raw Snowflake driver configuration.

Connection profiles may persist a generated profile ID and non-secret display settings such as account locator, user label, role, warehouse, and authentication method. Passwords, refresh tokens, private-key material, and session tokens are stored only through an OS credential-store adapter backed by macOS Keychain, Windows Credential Manager, or Linux Secret Service. Project files contain only the model and diagram state; they may reference neither secret values nor credential-store records. Main resolves a selected profile ID to a secret only for the duration of a connection operation, avoids logging it, clears in-memory references after use, and never returns it over IPC. If an OS-backed store is unavailable, secret persistence fails closed and the user must use a non-persisted session; there is no plaintext project-file, configuration-file, local-storage, or environment-file fallback.

## No-Web-Server Launch Path

A normally installed drawDB Desktop package launches from the operating system application icon or file association and opens its Electron window directly to the editor. The packaged renderer is loaded from signed/bundled local assets through an Electron custom protocol, or an equivalent packaged-file URL after routing compatibility is proven. Main resolves only application-owned assets, applies a restrictive Content Security Policy, and does not start or probe a loopback listener. Normal installed use therefore requires no Python runtime, terminal or CLI workflow, manually opened browser tab, Vite preview process, hosted service, or local HTTP/web server.

The Vite development server remains an explicitly development-only convenience for browser work and renderer hot reload. It is not installed, spawned, or contacted by a packaged application. Python `erd-tool` remains a reference and proof harness whose durable rules are ported to shared TypeScript; Python is not bundled and is never invoked by the delivered desktop runtime. The web-baseline smoke manifest below is evidence that existing drawDB still runs in the browser, not evidence for desktop behavior. SS-002 and SS-003 now have executable Electron runtime proof in `tests/electron-runtime.test.mjs`; later native-file, Snowflake, and installer items require their own executable proofs before closure.

Opening drawDB Desktop while offline follows the same local path: the operating system starts Electron main, main registers the application-owned asset protocol and creates the window, and the renderer loads bundled assets into that window. Local project Open/Save and ELK auto-arrange remain available without DNS, loopback networking, a hosted endpoint, or a database connection. Network access is an explicit capability of later live-connection work and is not part of application startup. No fallback may silently start Python, Vite, `vite preview`, or another HTTP process when local asset loading fails; startup must instead report a sanitized desktop error.

## Web and Desktop Build Topology

The repository keeps one drawDB renderer feature tree rather than forking the editor. The existing web target continues to enter through `src/main.jsx`, uses the established Vite behavior and browser routes, and produces the current web `dist` output. A desktop renderer entry may select the editor-first route and desktop bridge at build time, but shared components, contexts, database targets, import/export surfaces, project adapters, and ELK layout remain common. Desktop-specific behavior is capability-gated through a small typed adapter, with a browser implementation for existing download/file-input behavior and an Electron implementation for native dialogs. Existing web behavior must remain the fallback, not be replaced by desktop assumptions.

Electron main and preload compile as separate Node/Electron artifacts and are never included in the browser bundle. The desktop renderer is a separate Vite build or build mode with relative/custom-protocol-safe asset URLs; packaging consumes that static renderer output plus compiled main and preload artifacts without embedding a server. Output directories and package scripts must make web build, desktop renderer build, Electron process build, and installer packaging independently identifiable. SS-002 added those scaffold targets through `build:desktop-renderer`, `build:electron`, `build:desktop`, `start:electron`, and `verify:ss002`; every later desktop increment must keep `npm run test`, `npm run lint`, and `npm run build` green so current drawDB editing, supported database targets, browser routes, and exports are preserved.

## Acceptance Checks

This matrix closes the architecture-document slice only. Commands run from the repository root and are deterministic: they either exit successfully or identify the unmet contract. Passing the documentation and web-baseline rows does not assert native IPC, credential storage, Snowflake desktop bridges, or installer packaging; those executable proofs belong to later sprint items. SS-002 Electron launch evidence is recorded separately below.

| SS-001 requirement | Contract/evidence | Deterministic verification command |
| --- | --- | --- |
| Architecture document exists and Electron is first path | This file's `Electron Desktop Architecture`, `Electron Process Ownership`, and target topology assign explicit main, preload, renderer, and shared-TypeScript ownership. | `test -f docs/desktop-app-project-plan.md && rg -q 'Use \*\*Electron first\*\*' docs/desktop-app-project-plan.md && rg -q '^## Electron Desktop Architecture$' docs/desktop-app-project-plan.md && rg -q '^## Electron Process Ownership$' docs/desktop-app-project-plan.md` |
| Delivered app has no local-server, Python, browser-tab, or CLI dependency | `No-Web-Server Launch Path` defines direct installed launch from bundled local assets and separates Python/reference, Vite/development evidence, web-baseline smoke evidence, and SS-002 Electron runtime proof. | `rg -q '^## No-Web-Server Launch Path$' docs/desktop-app-project-plan.md && rg -q 'requires no Python runtime, terminal or CLI workflow, manually opened browser tab' docs/desktop-app-project-plan.md` |
| IPC is narrow and credentials never enter projects | `IPC and Credential Security` requires an allowlisted typed bridge, main-side validation, OS credential stores, sanitized errors, and fail-closed secret persistence. Existing canonical adapter tests also reject credential fields. | `rg -q '^## IPC and Credential Security$' docs/desktop-app-project-plan.md && npm run test` |
| Native local files and offline editing have assigned owners | Main owns native Open/Save/Save As/export dialogs and file I/O; preload exposes only typed operations; the React/drawDB renderer owns the model and messages. Offline startup and local editing do not depend on Snowflake or any network service. This is an architecture check only; implementing the bridge is SS-004. | `rg -q 'Main owns native Open, Save, Save As, and export dialogs' docs/desktop-app-project-plan.md && rg -q 'Local project Open/Save and ELK auto-arrange remain available' docs/desktop-app-project-plan.md` |
| Existing drawDB behavior and auto-arrange are preserved | `Web and Desktop Build Topology` keeps one renderer feature tree and the ownership contract keeps ELK auto-arrange renderer-visible without changing model semantics. Current unit tests prove the adapter and non-mutating layout baseline. | `npm run test && npm run build` |
| Cross-platform direction is explicit but packaging is deferred | macOS, Windows, and Linux share one architecture and project format; OS integrations are adapters, while installer production remains SS-012. | `rg -q 'macOS, Windows, and Linux follow the same process boundary and project format' docs/desktop-app-project-plan.md && rg -q 'producing installers remains SS-012' docs/desktop-app-project-plan.md` |
| Closest executable smoke evidence is labeled as web-only | `tests/smoke_manifest.json` pins the Python test-harness wrappers that start Vite and check the unit-test baseline; its description explicitly denies Electron implementation proof. Python is used only to orchestrate this repository smoke check, not by the delivered desktop runtime. | `node -e "const fs=require('node:fs');const m=JSON.parse(fs.readFileSync('tests/smoke_manifest.json','utf8'));const a=(x,y)=>JSON.stringify(x)===JSON.stringify(y);if(m.scope!=='existing-drawdb-web-baseline'||!m.description.includes('does not prove that the future Electron shell is implemented')||!a(m.start_command,['python3','scripts/start_web_smoke.py'])||!a(m.check_command,['python3','scripts/check_web_smoke.py'])||m.startup_delay_seconds!==2||m.startup_timeout_seconds!==30||m.check_timeout_seconds!==150)process.exit(1)"` |

## SS-002 Reconciliation

SS-002 acceptance criteria examined on 2026-07-14: `npm run build` still
works; a new Electron dev/start command exists; the app opens directly to the
editor or a desktop start route; packaged mode requires no local HTTP server;
and the existing web/Vite dev workflow remains usable. Evidence paths:
`package.json`, `vite.electron.config.js`, `tests/electron-runtime.test.mjs`,
`tests/smoke_manifest.json`, `src/electron/main.ts`,
`src/electron/preload.ts`, `src/App.jsx`, and `src/utils/openRoute.js`.
`package.json` preserves `dev` and `build`, adds `build:desktop-renderer`,
`build:electron`, `build:desktop`, `start:electron`, `test:electron`, and
`verify:ss002`, and sets `main` to `dist-electron/main.cjs`.
`vite.electron.config.js` builds isolated CommonJS Electron artifacts from
`src/electron/main.ts` and `src/electron/preload.ts`. `src/electron/main.ts`
loads the desktop renderer from local files with `{ hash: "/editor" }`, avoids
`loadURL`, rejects unexpected navigation, and does not start or require HTTP,
HTTPS, net, child process, Vite, preview, or Python startup paths.
`src/electron/preload.ts` exposes only a frozen `drawdbDesktop` runtime marker.
`tests/electron-runtime.test.mjs` is the executable proof for the scaffold: it
builds web, desktop renderer, and Electron artifacts; verifies the scripts;
checks direct local-file startup and relative desktop assets; verifies
context isolation, disabled Node integration, sandboxing, narrow preload, and
artifact separation; and also captures already completed SS-003 routing
behavior through `HashRouter` and hash-safe `openRoute` URLs. The routing proof
is recorded as adjacent evidence, not as new SS-002 work to duplicate.
`tests/smoke_manifest.json` remains scoped to the existing web baseline only.
Exact check run: `npm run verify:ss002`. Result: passed; `npm run test` passed
3/3 test files, then `npm run lint`, `npm run build`,
`npm run build:desktop-renderer`, and `npm run build:electron` all exited 0.
Build output still includes existing Vite warnings for direct eval in
`lottie-web` and large chunks. Remaining gaps are native project file IPC,
native Open/Save/Save As, Snowflake desktop bridges, live metadata, and
installer production; those are SS-004 and later. SS-002 is complete, and
because the routing evidence satisfies SS-003, the next eligible sprint item is
SS-004: Native Project File Bridge.

## Runtime Boundaries

Renderer process:

- visual editing
- diagram state
- existing drawDB UI
- Snowflake project actions
- validation display
- DDL preview

Electron main process:

- native app window
- app menus
- native file dialogs
- project file read/write
- SQL export file write
- recent file list
- Snowflake connection profiles
- secure credential access
- live Snowflake metadata queries

Shared TypeScript core:

- canonical model validation
- diagram-to-canonical conversion
- canonical-to-diagram conversion
- Snowflake DDL rendering
- Snowflake DDL import, if retained
- metadata-to-model mapping

## Security And Data Rules

Project files may contain:

- model structure
- table and column definitions
- relationship definitions
- layout positions
- viewport state

Project files must not contain:

- passwords
- tokens
- private keys
- Snowflake sessions
- warehouse runtime state
- account secrets
- local filesystem paths unless explicitly approved

Connection profiles may contain non-secret labels and settings. Secrets must live in OS-backed secure storage or Electron's secure storage mechanism, not in project files.

## Snowflake Functional Requirements

### Forward Engineering

The app must generate Snowflake DDL from the current diagram/model.

Acceptance requirements:

- Database/schema/table creation output is deterministic.
- Snowflake identifiers are legal or rejected with clear errors.
- PK/UQ/FK constraints render as informational `NOT ENFORCED`.
- Foreign keys may be emitted after table creation so cycles/self-references work.
- `RELY` is never added automatically.
- Export can save a `.sql` file through native desktop dialogs.

### Reverse Engineering From Live Snowflake

The app must connect to Snowflake, inspect selected databases/schemas/tables, and create an editable diagram.

Acceptance requirements:

- User can create/select a connection profile.
- User can browse available databases/schemas/tables with read-only metadata access.
- Metadata import creates tables, columns, nullable flags, types, comments, PK/UQ/FK metadata where available, and relationships.
- User can auto-arrange the imported diagram.
- Imported projects can be saved and reopened without reconnecting.
- Credentials are not written to project files.

### SQL Import

The app should support Snowflake DDL text/file import if it can be integrated cleanly with drawDB's existing import workflow.

Acceptance requirements:

- Snowflake appears in the normal import surface.
- Unsupported Snowflake syntax fails clearly.
- Import does not silently weaken unsupported objects into fake tables or comments.

## Existing drawDB Functionality Preservation

Before and after every meaningful desktop/Snowflake change, verify that existing drawDB behavior still builds and tests:

- `npm run build`
- `npm run lint`
- existing Node tests
- existing browser flow tests where available

Do not break existing database targets as part of Snowflake work.

## Packaging Requirements

Use `electron-builder` or equivalent to produce:

- macOS `.dmg` or `.zip` for Apple Silicon first, then universal/x64 as needed
- Linux AppImage first, optional `.deb`
- Windows NSIS installer or portable `.exe`

Initial packages may be unsigned/not notarized. Signing/notarization is a later release-readiness milestone.

## License Requirements

Because drawDB is AGPL-3.0, preserve:

- license file
- third-party notices
- source availability for distributed app/fork
- local patch history
- upstream attribution

Any packaged app must include an About/Licenses surface before external distribution.

## Milestones

### Milestone 1: Desktop Shell

An Electron app launches drawDB directly into the editor without a web server.

### Milestone 2: Native Project Workflow

Native New/Open/Save/Save As/Export works for ERD project files and Snowflake DDL.

### Milestone 3: Snowflake TypeScript Core

Snowflake model validation and DDL generation are TypeScript-first and covered by tests.

### Milestone 4: Snowflake Reverse Engineering

Electron main process connects to Snowflake and imports selected metadata into an editable diagram.

### Milestone 5: Cross-Platform Installers

Installable packages exist for macOS, Linux, and Windows with smoke evidence.

### Milestone 6: Release Candidate

The app has a stable name, icon, license surface, installer smoke tests, and a documented demo path.

## Risks

- drawDB's existing internal model may not align perfectly with the canonical Snowflake model.
- Snowflake metadata APIs may represent constraints/comments differently across objects.
- Electron packaging can become its own project if signing/notarization is pulled in too early.
- AGPL obligations must be handled deliberately before public distribution.
- Broad ideation can derail the build into provider breadth, redesign, or research.

## Risk Controls

- Keep each autonomous cycle tied to a sprint item.
- Prefer tests and runnable app increments over planning artifacts.
- Use mocked Snowflake metadata before live credentials are required.
- Defer signing/notarization until unsigned installers run.
- Keep Python as reference only; port product behavior into TypeScript/Electron.
- Preserve drawDB behavior unless a deliberate product decision says otherwise.
