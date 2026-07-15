# SS-002 Electron Runtime Review

Verdict: **fail**. The implementation preserves the web build, creates separate desktop renderer and Electron process outputs, and uses good renderer-isolation defaults. However, one High-severity correctness defect prevents the local-file launch from opening drawDB at a valid application route. The Medium findings concerning navigation hardening, smoke evidence, and runtime test coverage would not independently fail the review.

## Findings

### SS002-001 — High — local-file startup falls through to Not Found

`src/electron/main.ts:25` loads `dist-desktop/index.html` with `BrowserWindow.loadFile()`, while `src/App.jsx:12-22` uses `BrowserRouter` and declares only `/`, `/editor`, related child routes, and a wildcard. Under `file:`, the browser pathname is the filesystem path ending in `/dist-desktop/index.html`; it matches none of the application routes and therefore renders `NotFound`. The built HTML correctly uses relative JS and CSS URLs and does not need an HTTP server, but the desktop window still does not open to the editor or a usable desktop start route as SS-002 requires. Use a desktop-specific entry/router, such as a capability-gated `HashRouter`, or another file-safe route strategy while retaining the web router behavior, then assert the rendered start route in a built-runtime test.

### SS002-002 — Medium — navigation and renderer content are insufficiently constrained

`src/electron/main.ts:13-25` enables context isolation and sandboxing and disables Node integration, but it installs neither a `will-navigate` guard nor a `setWindowOpenHandler` policy. The shared renderer contains external links and `window.open` calls, and `index.html:39-50` loads remote stylesheets without a restrictive desktop Content Security Policy. The current frozen preload exposes only an inert version value, which limits immediate impact, but arbitrary remote navigation or new Electron windows should not share the desktop renderer trust boundary. Add a restrictive desktop CSP, block navigation away from application-owned local content, deny new Electron windows by default, and send explicitly allowlisted external URLs to the OS browser.

### SS002-003 — Medium — supplied user-smoke evidence is web-only

`artifacts/user-smoke/result.json:2-6` reports successful app startup and core-flow completion, but `artifacts/user-smoke/console.log` records only `npm run dev` and the Vite server. The pinned `tests/smoke_manifest.json` explicitly says this is the existing-web baseline and does not prove Electron, and `artifacts/user-smoke/screenshots/` is empty. The evidence meaningfully supports web preservation and the existing unit-test baseline, but it does not establish Electron startup, local-file loading, or an Electron core flow. Add an Electron-specific smoke that launches the built runtime without Vite, verifies the loaded local URL and visible editor/start route, and retains a screenshot or equivalent diagnostic record.

### SS002-004 — Medium — targeted tests validate source text rather than runtime behavior

`tests/electron-runtime.test.mjs:20-75` checks entry files, scripts, local-load syntax, security flags, and preload text with regular expressions. These are useful scaffold guards, but they never build or launch Electron, inspect the effective URL, or assert visible application content; all tests consequently pass despite SS002-001. Keep the fast contract checks, but add a built-runtime smoke that asserts the application-owned local URL, expected rendered route, lack of loopback dependency, and blocked navigation/window creation.

## Checks Run

The exact required command `python3 -m compileall scripts/check_web_smoke.py` was run from the repository root. It exited with code 0 and its actual output was `Compiling 'scripts/check_web_smoke.py'...`. It is the only command in the machine-readable `checks_run` array so deterministic replay contains no non-allowlisted command.

## Lens Notes

Correctness and local loading: main resolves `../dist-desktop/index.html` and calls `loadFile`, and the desktop build emits relative asset references, so the production path itself requires no web server. The shared `BrowserRouter` nevertheless interprets the filesystem pathname as the route and selects the wildcard page. Web preservation: isolated scratch builds of the ordinary web renderer and relative-base desktop renderer each passed after transforming 2,648 modules; the Electron process build passed after transforming three modules; current web tests, focused Electron tests, and lint all exited 0. These supplemental, non-allowlisted diagnostics are intentionally discussed only in prose and are absent from `checks_run`. Secure defaults: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, and the frozen non-IPC preload are sound minimal settings, but CSP, navigation, and window-open controls remain incomplete. Focused scope: the source change is small, keeps a shared renderer tree, and separates `dist`, `dist-desktop`, and `dist-electron`; no scope-expansion defect was found. Evidence and tests: the supplied smoke is credible web-baseline evidence but not Electron evidence, and the Electron suite is a static scaffold contract rather than executable launch proof. Review environment: the workspace snapshot has no usable Git worktree metadata and no review-worker tool was available; these are below-threshold environment notes and do not cause the failing verdict. The High route finding follows directly from the `loadFile` target and route table, independent of those limitations.
