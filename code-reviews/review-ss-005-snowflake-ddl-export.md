# SS-005 Snowflake DDL Export Review

Verdict: **pass** at the required High threshold. The implementation provides deterministic Snowflake DDL preview, browser download fallback, and native `.sql` saving through a fixed isolated bridge. Main owns the dialog and filesystem, rejects malformed or oversized requests, and accepts IPC only from the trusted main frame. Existing database dispatch branches and generic export choices remain present. No High or Critical finding was identified.

## Findings

### SS005-001 — Medium — DrawDB-style string and date defaults are emitted without SQL quoting

The Snowflake datatype model follows drawDB's existing convention that quote-bearing values are entered without quotes: `VARCHAR` accepts either quoted or unquoted text, and `DATE` validates a bare `YYYY-MM-DD` value (`src/data/datatypes.js:2271-2300`). Existing exporters pass those values through the type-aware `parseDefault`, which quotes and escapes values unless they are functions, keywords, or types that do not need quotes (`src/utils/exportSQL/shared.js:16-28`). The canonical Snowflake projection instead copies `field.default` verbatim and the renderer appends it directly after `DEFAULT` (`src/erdTool/projectAdapter.js:1676-1681,2037-2044`). Thus ordinary editor values such as `widget` for `VARCHAR` or `2026-07-15` for `DATE` produce invalid or semantically different Snowflake SQL. The focused fixture covers numeric, Boolean, and timestamp-expression defaults, so it does not detect this mismatch. Normalize defaults while the source field type is available: preserve recognized functions/keywords and numeric/Boolean literals, but quote and apostrophe-escape string/date/timestamp literals according to Snowflake rules. Add focused tests for bare strings, apostrophes, dates, timestamps, `NULL`, and supported functions.

### SS005-002 — Low — The preservation regression exercises only SQLite

The new preservation test is singular and asserts only the SQLite dispatcher branch (`tests/test-snowflake-ddl-export.test.mjs:304-310`). Static inspection confirms that MySQL, PostgreSQL, MariaDB, MSSQL, Oracle SQL, SQLite, and the generic export menu choices remain in place, and the supplied whole-suite log reports 90 passing tests. Nevertheless, there is no output assertion here for five other concrete database dispatch targets or for the generic target's export choices. Convert preservation coverage to a table-driven regression with representative fixtures for every existing concrete target and assert that the generic export submenu still exposes all established choices.

### SS005-003 — Low — Supplied smoke evidence is web-only, not a native export workflow

`artifacts/user-smoke/result.json` reports app startup, completion, check exit 0, and no blocking errors. Its console log starts Vite on `127.0.0.1:4173`, however, so it demonstrates the web baseline rather than a packaged/offline Electron interaction. The native path is supported by deterministic harness tests recorded in `check.log`, but those do not drive the final UI through preview, filename edit, save dialog, cancellation, write failure, and saved-byte verification. Add a final-tree packaged Electron smoke that runs with network unavailable and verifies those user-visible steps.

## Checks Run

- `python3 -m compileall scripts/check_web_smoke.py` — exit code 0. The command completed successfully and printed `Compiling 'scripts/check_web_smoke.py'...`.
- No npm, Node, chained shell command, arbitrary script, or environment-dependent command is included in the governed check record. Existing smoke logs were inspected as supplied artifacts, not rerun checks.

## Lens Notes

- Correctness and compatibility: identifiers, type bounds, deterministic ordering, deferred cyclic/self-referential foreign keys, informational `NOT ENFORCED`, and omission of `RELY` are preserved. SS005-001 covers the remaining default-literal incompatibility.
- Native and offline behavior: browser Snowflake export still uses the existing preview/download flow; desktop export uses a local save dialog and atomic local write without a server or network dependency. SS005-003 records the lack of a real packaged UI smoke.
- Security boundaries: the frozen preload exposes only `ddlExport.save`; Electron main requires the registered trusted main frame, exact payload keys, non-empty string contents, a `.sql` basename, and a 25 MB limit. The bridge cannot choose an arbitrary path or read files. Generated DDL is user-authored code and is written, never executed by the application.
- Existing database targets: the shared dispatcher retains SQLite, MySQL, PostgreSQL, MariaDB, MSSQL, Oracle SQL, and Snowflake cases, while the generic UI retains its established concrete export choices. SS005-002 notes that the new focused preservation assertion samples only SQLite.
- Error and cancellation behavior: render and native-save failures surface through UI toasts, native cancellation is a no-op result, and malformed main-process failures are sanitized before reaching the renderer.
- Artifact evidence: the supplied result is internally consistent with successful web startup and `check_exit_code: 0`; its check log records 90 passing tests, including seven focused SS-005 tests and three native export contract tests, but it is not direct native UI evidence.
