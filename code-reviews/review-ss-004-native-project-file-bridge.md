# SS-004 Native Project File Bridge Review

Verdict: **pass**. The current implementation satisfies the central SS-004 boundary: Electron main owns native dialogs, paths, reads, atomic replacement writes, and recent-file metadata; the isolated preload exposes only three fixed project operations; and the renderer serializes through the shared versioned project adapter. Successful native writes now attach the renderer document to the native path, established Open routes through the native workflow, cancellation preserves editor state, errors are sanitized, credentials are excluded structurally, and the runtime harness demonstrates offline save/reopen. No High or Critical finding remains.

## Findings

### SS004-001 — Medium — The 25 MB open limit is enforced only after the whole file is read

`project:open` calls `fs.readFileSync(filePath, "utf8")` before `validateProjectContents` checks `Buffer.byteLength` (`src/electron/main.ts:184-187`, with the limit at lines 44-49). A selected file far larger than 25 MB is therefore fully allocated and decoded in the Electron main process before rejection. A sufficiently large or sparse file can stall or exhaust the main process and discard unsaved renderer work, defeating the intended resource limit. Open the selected file descriptor, check its size before allocation, and use a bounded read that still rejects growth beyond the limit; add a test proving oversized input is rejected without invoking an unbounded read.

### SS004-002 — Medium — The authoritative drawDB DTO does not validate all identity and reference invariants

`validateDrawdbEntityKeys` checks table and per-table field identities, but it does not require unique IDs for relationships, notes, areas, types, or enums. Relationship `fields` pairs are shape-checked without resolving each pair against its endpoint tables, and index/unique-constraint field arrays are not resolved against their owning table (`src/erdTool/projectAdapter.js:425-448,499-613`). Because `canonicalProjectToDiagram` returns `drawdb_document` as the editable representation whenever it is present (`src/erdTool/projectAdapter.js:1335-1362`), a manually authored but allowlisted v1 file can introduce duplicate editor identities or dangling nested references. Add versioned semantic validation for collection IDs and all table/field references, with negative compatibility fixtures.

### SS004-003 — Low — A failed native Open detaches the renderer's known-path flag from the still-open file

When native Open fails, the renderer unconditionally clears `hasNativeProjectPath` (`src/components/ErdToolActions.jsx:201-219`). Main changes `currentProjectPath` only after reading and validating a selected file (`src/electron/main.ts:184-190`), so a failed attempt while editing an already-open native project leaves main correctly attached to the old path while the renderer forgets that attachment. The next Save unnecessarily becomes Save As. Preserve the previous known-path state for main-reported open failures, or return an explicit result describing whether main changed ownership and update the renderer from that result.

### SS004-004 — Low — Supplied smoke evidence is web-only and predates the final renderer edits

`artifacts/user-smoke/result.json` reports successful startup and core flow with no blocking errors, and `check.log` records 80 passing tests including 23 SS-004 subtests. However, `console.log` shows a Vite server at `127.0.0.1:4173`, so this is web-preservation evidence, not a real Electron UI workflow. The smoke artifacts are timestamped before the final `ErdToolActions.jsx` and Electron-test edits, while the current React integration tests largely assert source patterns. Add a packaged Electron smoke that drives New/Open/Save/Save As, canceled and failed dialogs, edits, restart, and byte-verified reopen on the final tree.

## Checks Run

- `python3 -m compileall scripts/check_web_smoke.py` — exit 0. Observed output: `Compiling 'scripts/check_web_smoke.py'...`.
- The governed check record contains no npm commands, chained commands, arbitrary scripts, or unavailable environment-dependent checks. The supplied user-smoke logs were reviewed as existing evidence rather than rerun or added as a command.

## Lens Notes

- Native open/save correctness: main owns all selected paths, validation precedes writes, normalized contents are atomically replaced, renderer attachment is updated after successful Save/Save As, and native Open is wired into the established command. SS004-001 and SS004-003 cover remaining resource-limit and failed-open state hardening.
- Context isolation: `BrowserWindow` enables `contextIsolation`, disables Node integration, enables sandboxing and web security, and main accepts project IPC only from the registered main frame.
- Preload API narrowness: the frozen versioned surface exposes only `projectFiles.open`, `save`, and `saveAs`; it exposes no generic channel invocation, Electron object, filesystem primitive, environment access, listener, or Node module entry point.
- Filesystem and dialog ownership: Electron main owns open/save dialogs, current paths, file I/O, replacement writes, and user-data recent metadata. The renderer can provide only validated project contents and a basename suggestion.
- Project serialization compatibility: canonical project version 1 and legacy v1 files without `diagram_layout` are accepted; `drawdb_document` preserves every declared drawDB database target and editor-only model state. SS004-002 identifies semantic checks still missing for manually authored authoritative DTOs.
- Credential exclusion: exact allowlists, normalized reserialization, sensitive-key rejection, canonical physical-model restrictions, and duplicate-key normalization prevent reviewed credential structures from reaching disk while allowing legitimate identifier values such as ACCOUNT and ROLE.
- Cancellation and errors: dialog cancellation returns an explicit no-op and renderer save state is restored; native failures become stable sanitized project errors. SS004-003 is a low-severity path-attachment inconsistency after a failed Open, not silent data overwrite.
- Offline reopen: the built-main harness saves locally and reopens the same canonical bytes in a fresh runtime without loading HTTP, network, child-process, Vite, or Python startup modules.
- Preservation of drawDB functionality: the implementation retains one renderer tree, browser persistence fallbacks, supported database targets, existing import/export surfaces, and renderer-owned ELK auto-layout. The user smoke confirms the web baseline, subject to SS004-004's evidence limitation.
