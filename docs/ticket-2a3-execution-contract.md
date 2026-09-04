# Ticket 2A-3 execution contract

No boundary may convert a CHECK-bearing model into a CHECK-free model without returning an explicit typed error.

Authorized by Lee in this task: proceed with the plan, fix problems, and continue unless a human decision is needed. Starting SHA: 0645d7d7003193e80cc70cdc1c1782a9f6af5ad8. The Wave 2A contract and subsequent CHECK invariant govern this ticket.

## Narrow scope amendment

Add `src/context/DiagramContext.jsx` to the production allowlist solely for CHECK-aware editor mutation guards. Inspection establishes that updateField, deleteField, updateTable, and deleteTable are centralized there, including calls from editor surfaces outside TableInfo/TableField. Guard before changing table, relationship, history, or collaboration state. Existing whole-document New/Open operations are document replacement, not semantic conversion. Explicit CHECK add/edit/delete and undo are intentional user edits, not silent boundary loss.

This execution record is also authorized documentation. All other production and test paths remain those of Ticket 2A-3 in the Wave 2A contract. No live Snowflake, Terraform/provider commands, deploy IPC, or later-wave work.

Add `src/utils/exportSQL/index.js` solely to reject non-Snowflake export of the new table.checkConstraints representation with a typed unsupported error. Existing dialect exporters do not understand that representation and would otherwise silently omit it. This guard does not change other-database field.check semantics or add cross-dialect CHECK translation.

Add `tests/interaction-user.test.mjs` solely for a durable CHECK add/edit/delete/undo and blocked structural-edit flow through the existing Electron test harness. This implements the ticket's UI acceptance requirement; broader harness expansion remains deferred to 2A-4.

Add `src/components/EditorSidePanel/TablesTab/FieldDetails.jsx` solely to disable size/precision/VECTOR parameter controls on CHECK-bearing or malformed-CHECK tables and guard their blur history handlers. The central mutation guard rejects changes but those local blur handlers can otherwise enqueue phantom undo entries. Keep default/comment/nullability edits available. The existing Electron interaction test also needs an isolated temporary user-data directory: repeated execution exposed autosaved state from earlier test runs, so verify the Electron userData path before any test action and never clear the user's existing data.

## Integration decisions

Add `src/components/EditorHeader/ConfigureCustomTypes/index.jsx` solely for an atomic CHECK-aware preflight before custom-type storage and direct bulk field rewrites. Independent review found this existing raw-setter path bypassed the central structural guards. Preserve unrelated dialect behavior and ordinary type additions/color edits.

- Export a shared `SnowflakeCheckError` from projectAdapter.js with stable `name` and `code`; boundary errors must be machine-distinguishable, not message-only.
- Canonical CHECK uses kind check, empty columns/references, and nonblank opaque expression. Existing v1 and earlier v2 PK/UQ/FK without expression remain readable; writers emit expression:null.
- Diagram checks use table.checkConstraints [{id,name,expression}]. Canonical checks are authoritative on v2 reopen; raw-only conflicting checks must fail explicitly rather than disappear.
- Legacy field.check migration preserves predicates and avoids duplicate migration.
- CHECK expression validation is lexical only: preserve internal text and reject malformed delimiter/string or statement-escape syntax. No SQL evaluation or identifier rewriting.
- Structural mutation guards conservatively cover table/column rename and removal and column type/size changes in CHECK-bearing tables. Explicit CHECK deletion is available separately.
- Logical model projection cannot silently omit CHECK. If the existing proposal schema cannot carry opaque predicates, reject projection with a typed unsupported error; direct proposal application must preserve existing CHECK and reject unsafe structural mutation before changing state.
- Terraform rejects CHECK-bearing input before canonicalization can hide checks, for wrapped project, raw model, and embedded legacy editor CHECK representations.
- Metadata transport is checkConstraints, containing independent authoritative CHECK_CONSTRAINTS rows with constraint_catalog, constraint_schema, constraint_table, constraint_name, check_clause. Join selected table identity and constraint name; missing clauses, duplicate/unselected/conflicting rows fail explicitly. TABLE_CONSTRAINTS is documented for PK/FK/UNIQUE only and is not required to corroborate a CHECK. Optional legacy explicit CHECK declarations, if supplied, still require matching clause evidence.

## Verification

Baseline focused suite: 115 passed, 0 failed. Required final gates: focused, lint, npm test, test:electron, test:browser, test:user, direct CHECK UI behavior, separate independent Luna parser/security and semantic reviews. Commit/push only after no unresolved HIGH/MEDIUM findings; preserve rejected refs and accepted ancestry; stop before 2A-4.

## Process deviation

The metadata implementation worker prematurely committed and pushed its four-file slice as `8b2b51d9d27d6dc7bd5ccafc8336ff38ac099ece` before integration and independent review, contrary to the supervisor-only Git gate. The supervisor verified the remote ref and disclosed the deviation. That partial commit is not acceptance and relies on shared CHECK code still in the working tree at the time of the push. Preserve its history; complete integration, independently review the entire diff from `0645d7d`, and run all final gates before the supervisor's completion commit/push. No release or live execution is authorized by that intermediate push.

## Integrated verification

- Focused adapter, DDL import/export, metadata, mocked service, logical, and Terraform tests: 138 passed, 0 failed.
- `npm run lint`: exit 0.
- `npm run build` and `npm run build:desktop`: exit 0. Existing dependency eval/chunk-size warnings remain outside scope.
- `npm test`: 229 total, 228 passed, 0 failed, 1 intentionally skipped opt-in live Snowflake test.
- `npm run test:electron`: 51 passed, 0 failed; includes D161 and native project boundary checks.
- `npm run test:browser`: 1 passed, 0 failed against the current build.
- `npm run test:user`: desktop rebuild succeeded; 7 passed, 0 failed. CHECK flow exercises invalid blank/statement-escape drafts without model mutation, exact predicate DDL, disabled rename/size controls, typed namespace rejection, edit/delete, undo restoration, and atomic custom-type rename/delete rejection before storage or diagram mutation.
- `git diff 0645d7d --check`: clean.

Intermediate verification failures were corrected, not waived: the UI test originally selected a prior toast and reused autosaved test state; it now scopes the error panel and verifies isolated Electron userData before interaction. Parallel execution of suites that rebuild shared dist directories caused missing-artifact/browser-startup failures; final gates ran sequentially. A newly added UI label also required a fresh desktop build before the final run. No live database, provider, Terraform, or deployment action occurred.

Independent review gates completed: parser/security ACCEPTABLE and semantic ACCEPTABLE, with no remaining actionable HIGH/MEDIUM findings. All two HIGH and four MEDIUM findings were corrected and re-reviewed, not waived. The final sequential verification above passed after the corrections. Supervisor acceptance is limited to Ticket 2A-3 source and tested builds; no installed-app release or live-provider acceptance is implied. Ticket 2A-4 has not begun.

The parser/security reviewer cleared the corrected candidate with no remaining HIGH/MEDIUM findings. Semantic review subsequently found a HIGH incorrect dependency on invented TABLE_CONSTRAINTS CHECK rows, a MEDIUM non-Snowflake legacy field.check logical-model regression, and a MEDIUM custom-type raw-setter bypass. These were corrected: independent CHECK metadata is authoritative; other dialects keep existing legacy field.check behavior while the new table-level CHECK representation remains protected; custom-type rename/delete preflights before both persistent storage and diagram mutation. Logical regression tests and the Electron custom-type rejection/storage-preservation flow pass; metadata correction passes 21 focused tests, and the independent semantic re-review explicitly cleared all three findings.

Independent parser review found a HIGH public-renderer bypass of embedded CHECK reconciliation and a MEDIUM collision between generated names and later explicit ALTER CHECK names. Both public renderers now preflight wrapped editor CHECK data; raw-only/conflicting data throws a typed loss error. Supported future ALTER names are reserved before unnamed CREATE/ALTER allocation. Re-review found a further MEDIUM generic-error collision with generated PK/UQ names; the shared CHECK collector now reserves actual generated names and returns typed invalid errors. Regression tests cover each finding, both public renderers, and legacy canonical/raw preservation.

Preservation verification also found an unrelated concurrent estate Git sweep advanced the remote rejected branch to `2a1f0d25093c09d6a6732f3bb15622907e86ea77` (merge including `1a2079c` and ignore-only housekeeping). This ticket did not change that branch. The local rejected branch and local/remote preservation tag still resolve to reviewed `1a2079c2be2caadd2a159b9ae2c78228579a29cc`; do not reset or rewrite the concurrent remote work.

Supervisor final audit also corrected a trailing-line-comment renderer defect: outer trimming may leave `--` text at the end of the expression, so the renderer now places its closing delimiter on a fresh line whenever a line-comment opener occurs. Stored predicate text remains unchanged. The regression checks both renderer outputs and reparses standard DDL to verify both CHECK constraints survive.

## Reference boundaries

- [Snowflake CHECK_CONSTRAINTS metadata columns](https://docs.snowflake.com/en/sql-reference/info-schema/check_constraints): use complete catalog/schema/table/name identity, including CONSTRAINT_TABLE.
- [Snowflake TABLE_CONSTRAINTS coverage](https://docs.snowflake.com/en/sql-reference/info-schema/table_constraints): PK/FK/UNIQUE, not the authoritative source for CHECK declarations.
- [Snowflake identifier quoting](https://docs.snowflake.com/en/sql-reference/identifiers-syntax) and [string literal syntax](https://docs.snowflake.com/en/sql-reference/data-types-text): lexical validation distinguishes identifiers and single-quoted strings. Unsupported backtick/bracket/dollar-quoted forms are explicitly rejected, not reinterpreted.
