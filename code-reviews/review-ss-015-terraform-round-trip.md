# Independent Review — SS-015 Terraform Round-Trip Engineering

Scope reviewed: `src/erdTool/terraformRoundTrip.js` (import + export engine),
`tests/terraform-round-trip.test.mjs`, the UI wiring in
`src/components/EditorHeader/ControlPanel.jsx`,
`src/components/EditorHeader/Modal/Modal.jsx`,
`src/components/EditorHeader/Modal/ImportSource.jsx`, the canonical validation
boundary in `src/erdTool/projectAdapter.js`, the SS-015 acceptance text in
`docs/desktop-app-sprint-plan.md`, and the recorded user-smoke evidence in
`artifacts/user-smoke/` (`result.json`, `check.log`, `console.log`).

Verdict: **pass**. No High or Critical finding. Two Medium and five Low findings
are recorded below; none of them is a security break, a data-loss path, or a
regression of existing drawDB behavior.

## Checks Run

`python3 -m compileall scripts/check_web_smoke.py` — exit code 0, output
`Compiling 'scripts/check_web_smoke.py'...`. This is the only allowlisted
deterministic command for this review and it is the only entry in
`checks_run` in the companion verdict JSON. It byte-compiled the smoke checker
and created `scripts/__pycache__/` (explicitly permitted); no other workspace
file outside `code-reviews/` was modified by this review.

Evidence inspected rather than re-executed (per the review contract, these are
not listed as `checks_run` entries):

- `artifacts/user-smoke/check.log` — `npm run test` via
  `scripts/check_web_smoke.py`: TAP summary `# tests 129 / # pass 129 / # fail 0`,
  19 suites, duration ~50.5 s. Suite `SS-015 Terraform round-trip engineering`
  reports 9 passing subtests including deterministic import, multi-file module
  import, deterministic export, canonical round trip, malformed-HCL fail-closed,
  unsupported/ambiguous rejection, state/credential rejection, preview-only, and
  the existing-provider regression case.
- `artifacts/user-smoke/result.json` — `app_started true`,
  `core_flow_completed true`, `start_exit_code -15` (expected SIGTERM teardown of
  the dev server), `check_exit_code 0`, `blocking_errors []`.
- `artifacts/user-smoke/console.log` — Vite 8.1.0 dev server bound to
  `127.0.0.1:4173`, no build or transform errors logged.
- Timestamp coherence: `terraformRoundTrip.js` 11:44 and the terraform test file
  11:42 both predate the smoke artifacts at 11:48, so the recorded evidence
  covers the reviewed code state.
- No lint or build log exists anywhere in the workspace for SS-015; see finding
  SS015-R-003.

Independent verification I performed by reading the code and by exercising the
shipped modules out-of-tree (scratch scripts under `/tmp`, no workspace writes):
deterministic double import/export, export idempotence, byte-identical
re-export through the full UI path (`terraformHclToDiagram` →
`diagramToCanonicalProject` → `canonicalProjectToTerraformHcl`), constraint-name
and multi-column-unique survival across the diagram hop, export after a
simulated column rename and a simulated added field, and eleven hostile-input
cases (raw `.tfstate`, `.tfstate` smuggled as a second module file, `.tfvars`
attributes, heredoc, `locals`, `output`, `data`, `provider` alias attribute,
`for_each`, JSON-syntax `.tf.json`, string interpolation, lowercase quoted
identifier).

## Lens Notes

**Deterministic import and export.** Import is stable: resource maps are keyed
by resource name, but every emitted collection (`namespaces`, `tables`,
`constraints`, `relationships`) is sorted by canonical id before it leaves the
module, and repeated imports of the same source produced identical JSON. Export
is stable and reorder-invariant: `validateProjectOrModel` re-sorts namespaces,
tables and constraints, `labelMap` derives collision-suffixed labels from the
sorted order, and the test suite additionally asserts equality against
`reorderedCanonicalProject()`. Export is idempotent (`out === out2`) and
re-importing exported HCL reproduced the identical `physical_model`.

**Semantic preservation.** Namespaces (catalog + schema), tables, ordered
columns with parameterized Snowflake types, `nullable`, comments, defaults,
primary keys, unique keys (including multi-column), foreign keys and derived
`many_to_one` relationships all survive HCL → canonical → diagram → canonical →
HCL byte-identically in my end-to-end probe. Constraint names survive the
diagram hop through `table.uniqueConstraints` and field flags, and export still
succeeded with correct column names after a simulated field rename and a
simulated field addition. Column ordinal integrity is enforced by the canonical
boundary: an out-of-order columns array fails with `ordinal must be one-based and
contiguous in column order`, which also confirms export cannot bypass
`canonicalProjectToDiagram` validation.

**Fail-closed handling.** The supported surface is a strict allowlist
(`RESOURCE_TYPES`, `TABLE_RESOURCE_KEYS`, `COLUMN_KEYS`,
`TABLE_CONSTRAINT_KEYS`, `TYPE_FAMILIES`) with per-family bound checks. Every
hostile input I tried was rejected with an explicit message: unknown resources
and blocks, meta-arguments (`count`, `for_each`, `provider`), unsupported types,
non-literal expressions (`var.*`), string interpolation, lowercase quoted
identifiers, heredocs, JSON syntax, `.tfvars` attributes, and duplicate
constraint names on one table (caught as `constraints must have unique ids`).
Two gaps: an explicit `database` that disagrees with a referenced
`snowflake_schema` is silently dropped (SS015-R-001), and schema-to-schema
`database` references resolve only in declaration order, so a valid module can be
rejected purely because of file naming (SS015-R-002).

**Preview-only safety.** Export opens `MODAL.CODE` with `extension: "tf"` and
only ever writes through the existing `saveAs` download path; there is no
`spawn`/`exec` of `terraform` anywhere in the changed files, and failures raise
`Toast.error` instead of proceeding. The suite's source-regex assertion is the
real guard here — the `commandRunner` option the tests pass is ignored by the
single-parameter export function, so those `commandCalls` assertions are vacuous
(SS015-R-005).

**Credentials and Terraform state exclusion.** `provider` blocks are rejected
outright as possibly credential-bearing, `terraform { backend ... }` is rejected,
and `.tfstate`-shaped JSON is rejected before tokenizing. A `.tfstate` smuggled
as a second module file defeats the JSON sniff but still dies in the tokenizer,
so nothing is imported. Export can only emit what the validated canonical model
holds, and the model rejects credential fields, so no secret can reach generated
HCL or `.erd.json`. Test fixtures use `[REDACTED_*]` placeholders, so no real
secret material enters fixtures or snapshots. One bounded exposure: tokenizer
errors echo up to 16 raw source characters into the UI banner (SS015-R-008).

**Existing drawDB behavior.** `importSourceFormat` defaults to `"sql"` and every
pre-existing import entry sets it explicitly, so the SQL dispatch in `Modal.jsx`
is unchanged for MySQL/Postgres/SQLite/MariaDB/MSSQL/Oracle/Snowflake; the
Terraform export entry is additive behind `database === DB.SNOWFLAKE`;
`openExportModal` still resets `nativeDdl` so a Terraform preview cannot inherit
the native-DDL confirm path. The 129-test suite (including the SQLite and MySQL
regression case) is green in the recorded evidence.

**Evidence quality.** The smoke gate proves the node test suite passes and that
the dev server serves an HTML shell containing `id="root"`; it does not execute
renderer JavaScript, so no recorded evidence exercises the Terraform import or
export UI in a browser, and no lint or build log exists for the three changed
JSX files (SS015-R-003). The acceptance bullet about selecting a Terraform
"module directory" is only met programmatically; the upload control is
single-file (SS015-R-007).

## Review-Environment Limitations

These are reviewer-side constraints, not product defects, and they do not affect
the verdict:

1. `.git/` in this workspace is empty and `git` reports "not a git repository",
   so I could not diff SS-015 against a baseline. Blast radius was inferred from
   file mtimes (2026-07-24: `terraformRoundTrip.js`, `terraform-round-trip.test.mjs`,
   `ControlPanel.jsx`, `Modal.jsx`, `ImportSource.jsx`, `vite.electron.config.js`,
   `src/utils/exportSQL/shared.js`, `docs/desktop-app-sprint-plan.md`) plus
   reading each file in full. I could not attribute the `shared.js` edit to
   SS-015 versus an earlier item; its current content is coherent and its
   consumers (all seven SQL exporters) are covered by the green suite.
2. `npm test`, `npm run lint`, and `npm run build` are outside this review's
   allowlist, so those signals were assessed from recorded evidence only.

## Findings Summary

| id | severity | subject |
| --- | --- | --- |
| SS015-R-001 | Medium | explicit table `database` silently overridden by schema reference |
| SS015-R-002 | Medium | schema-to-schema `database` reference resolution is order/file-name dependent |
| SS015-R-003 | Medium | no lint/build evidence and no browser-executed evidence for the changed UI |
| SS015-R-004 | Low | `.tfvars` advertised in the upload filter but always rejected |
| SS015-R-005 | Low | vacuous `commandRunner` assertions in the preview-only tests |
| SS015-R-006 | Low | `hcl`/`tf` not mapped to a Monaco language; `.tf` download typed `application/json` |
| SS015-R-007 | Low | module-directory selection unmet in the UI (single-file upload only) |
| SS015-R-008 | Low | tokenizer error messages echo raw source fragments |
