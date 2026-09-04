# Wave 2A Contract: Snowflake Type and Constraint Semantic Fidelity

Date: 2026-09-04

Planning branch: `remediation/d161-deploy-boundary`

Accepted Wave 1 source: `ea8b8044beb559ea4136239400f20169225e648d`

Frozen rejected source: `1a2079c2be2caadd2a159b9ae2c78228579a29cc`

## Decision

Wave 2A will establish one Snowflake semantic contract shared by the editor,
canonical model, DDL parser and renderer, reverse-engineering mapper, logical
model boundary, and Terraform interchange boundary. It will correct required
and defaulted parameters, represent `VECTOR` as an element type plus dimension,
and preserve Snowflake CHECK constraints as first-class canonical data.

The wave will not attempt live deployment, namespace or identifier repair,
general persistence repair, or broad acceptance-harness expansion.

## Verified Starting State

After `git fetch --prune origin`:

- Branch: `remediation/d161-deploy-boundary`.
- HEAD: `ea8b8044beb559ea4136239400f20169225e648d`.
- Worktree: clean.
- Tracking: `origin/remediation/d161-deploy-boundary`, ahead 0 / behind 0.
- Remote branch SHA: `ea8b8044beb559ea4136239400f20169225e648d`.
- `origin/main`: `d654b2dac0028b74d8cfecded61524f8400e2ba9`.
- Preservation tag `rejected/s1-02-fk-direction-1a2079c` peels to the exact
  rejected SHA `1a2079c2be2caadd2a159b9ae2c78228579a29cc`.
- The Wave 1 contract remains at
  `docs/wave-1-d161-deploy-boundary-contract.md`; the accepted Wave 1 diff and
  its D161 tests were inspected. Neither preserved reference may be changed.

No Wave 2A production code or live Snowflake state was changed during planning.

## Authoritative Semantic Sources

- Snowflake type summary:
  <https://docs.snowflake.com/en/sql-reference/intro-summary-data-types>
- Numeric types:
  <https://docs.snowflake.com/en/sql-reference/data-types-numeric>
- String and binary types:
  <https://docs.snowflake.com/en/sql-reference/data-types-text>
- Date and time types:
  <https://docs.snowflake.com/en/sql-reference/data-types-datetime>
- Semi-structured types:
  <https://docs.snowflake.com/en/sql-reference/data-types-semistructured>
- Structured types:
  <https://docs.snowflake.com/en/sql-reference/data-types-structured>
- Geospatial types:
  <https://docs.snowflake.com/en/sql-reference/data-types-geospatial>
- Vector types:
  <https://docs.snowflake.com/en/sql-reference/data-types-vector>
- Constraints:
  <https://docs.snowflake.com/en/sql-reference/sql/create-table-constraint>
- CHECK metadata:
  <https://docs.snowflake.com/en/sql-reference/info-schema/check_constraints>

## Current Semantic Architecture and Loss Points

1. `src/data/datatypes.js` is the editor registry. It exposes a partial alias
   set, makes Snowflake CHECK unavailable, gives `CHAR` the wrong empty default,
   gives `BINARY` the wrong default of 1, and defines `VECTOR` as parameterless.
2. `src/components/EditorSidePanel/TablesTab/TableField.jsx` canonicalizes only
   UI-known aliases. Its type-change branches can clear CHECK state.
3. `src/components/EditorSidePanel/TablesTab/FieldDetails.jsx` has scalar size
   and two-number precision editors, but no `VECTOR(element, dimension)` editor.
4. `src/erdTool/logicalModel.js` validates only a generic `FAMILY(args)` shape.
   It admits combinations later rejected by the canonical adapter and does not
   represent CHECK constraints.
5. `src/erdTool/projectAdapter.js` independently defines canonical families,
   type bounds, field conversion, DDL parsing, and DDL rendering. Its five-key
   type shape cannot carry VECTOR parameters. Its parser rejects documented
   aliases and several valid omitted-parameter forms, while accepting invalid
   bare VECTOR. Its canonical constraints allow only PK, UNIQUE, and FK.
6. `src/utils/importSQL/snowflake.js` is a thin route into the adapter parser;
   `src/utils/exportSQL/index.js` routes the diagram through the canonical model
   and adapter renderer. They add no semantic repair of their own.
7. `src/electron/snowflakeService.js` has a different alias map and retrieves
   only generic COLUMNS parameters plus PK/UNIQUE/FK metadata. It cannot recover
   VECTOR element/dimension or CHECK clauses.
8. `src/erdTool/snowflakeMetadata.js` applies documented defaults, but makes
   VECTOR parameterless and ignores CHECK. This means metadata import and DDL
   import do not produce the same canonical values.
9. `src/erdTool/terraformRoundTrip.js` implements a fourth type contract with
   only seven families and no CHECK. Shared canonicalization can make its own
   import/export tests pass after unsupported semantics have already vanished.
10. `drawdb_document` can retain `field.check` while `physical_model` drops it;
    reopening may display a value that Snowflake DDL and Terraform omit.

## Type Flow

```text
Snowflake DDL
  -> projectAdapter.parseSnowflakeDataType (aliases/defaults rejected or changed)
  -> physical_model.data_type (five keys; VECTOR arguments impossible)
  -> canonicalProjectToDiagram (family + overloaded field.size)
  -> editor/logical model (partial aliases; generic argument validation)
  -> diagramToCanonicalProject (independent parsing/default rules)
  -> renderCanonicalSnowflakeDDL (trusts canonical data_type.text)
  -> Snowflake DDL

Snowflake account
  -> snowflakeService COLUMNS + key queries (VECTOR/CHECK absent)
  -> snowflakeMetadata canonicalDataType (another default/type map)
  -> the same canonical/editor/export path

Terraform HCL
  -> terraformRoundTrip.parseDataType (seven-family subset)
  -> the same canonical model
  -> Terraform exporter (same subset; CHECK absent)
```

The implementation must introduce `src/erdTool/snowflakeTypeContract.js` as the
single pure source for alias recognition, documented defaults, bounds,
canonical type validation, and canonical type text. Callers may adapt UI or
metadata shapes, but may not redefine Snowflake rules.

## Canonical Type Shape

Model v2 uses the uniform shape:

```json
{
  "family": "VECTOR",
  "text": "VECTOR(FLOAT, 256)",
  "precision": null,
  "scale": null,
  "length": null,
  "element_type": "FLOAT",
  "dimension": 256
}
```

All seven keys are present. Fields that do not apply are `null`. `text` is a
derived invariant, never an independent source of truth. Aliases are accepted
at input boundaries but are not retained as canonical identity.

Documented omitted parameters are resolved to their effective values. This is
semantic normalization, not invention: `NUMBER` becomes `NUMBER(38, 0)`, bare
`VARCHAR`/`STRING`/`TEXT` becomes `VARCHAR(16777216)`, bare `CHAR`/`CHARACTER`
becomes `VARCHAR(1)`, bare `BINARY` becomes `BINARY(8388608)`, and omitted
TIME/TIMESTAMP precision becomes 9. Export always emits those explicit values.

## Supported-Type Contract

| Accepted input | Canonical family and retained parameters | Canonical export | Invalid combinations | Required proof |
|---|---|---|---|---|
| `NUMBER`, `NUMBER(p)`, `NUMBER(p,s)`; `DECIMAL`, `DEC`, `NUMERIC` with the same forms | `NUMBER`; resolve missing `p=38`, missing `s=0`; retain `p,s` | `NUMBER(p, s)` | `p` outside 1..38; `s` outside 0..min(37,p); more than two args | defaults, boundaries, alias matrix, parse-render-parse equality |
| `INT`, `INTEGER`, `BIGINT`, `SMALLINT`, `TINYINT`, `BYTEINT` | `NUMBER(38,0)` | `NUMBER(38, 0)` | any alias parameters | each alias and parameter rejection |
| `FLOAT`, `FLOAT4`, `FLOAT8`, `DOUBLE`, `DOUBLE PRECISION`, `REAL` | `FLOAT`; no parameters | `FLOAT` | any parameters | every alias; no NUMBER coercion |
| `BOOLEAN` | `BOOLEAN`; no parameters | `BOOLEAN` | any parameters | canonical and invalid-arg cases |
| `VARCHAR`, `STRING`, `TEXT`, `VARCHAR2`, `NVARCHAR`, `NVARCHAR2`, `CHAR VARYING`, `NCHAR VARYING`, each optional `(n)` | `VARCHAR`; retain/resolve `length`; default 16777216 | `VARCHAR(n)` | `n` outside 1..134217728; multiple args | every alias, default, max, over-max |
| `CHAR`, `CHARACTER`, `NCHAR`, each optional `(n)` | `VARCHAR`; default 1, otherwise retain `n` | `VARCHAR(n)` | same VARCHAR invalid lengths | prove bare form differs from bare VARCHAR |
| `BINARY`, `VARBINARY`, optional `(n)` | `BINARY`; default 8388608; retain bytes | `BINARY(n)` | `n` outside 1..67108864; multiple args | default, max, over-max, alias |
| `DATE` | `DATE`; no parameters | `DATE` | any parameters | canonical and invalid-arg cases |
| `TIME`, optional `(p)` | `TIME`; default/retain precision 9 or 0..9 | `TIME(p)` | noninteger, p outside 0..9, multiple args | p=0, p=9, default, invalid |
| `TIMESTAMP_NTZ`, `TIMESTAMPNTZ`, `TIMESTAMP WITHOUT TIME ZONE`, `DATETIME`, optional `(p)` | `TIMESTAMP_NTZ`; default/retain p=9 or 0..9 | `TIMESTAMP_NTZ(p)` | invalid precision/args | each spelling plus precision matrix |
| `TIMESTAMP_LTZ`, `TIMESTAMPLTZ`, `TIMESTAMP WITH LOCAL TIME ZONE`, optional `(p)` | `TIMESTAMP_LTZ`; default/retain p=9 or 0..9 | `TIMESTAMP_LTZ(p)` | invalid precision/args | each spelling plus precision matrix |
| `TIMESTAMP_TZ`, `TIMESTAMPTZ`, `TIMESTAMP WITH TIME ZONE`, optional `(p)` | `TIMESTAMP_TZ`; default/retain p=9 or 0..9 | `TIMESTAMP_TZ(p)` | invalid precision/args | each spelling plus precision matrix |
| `TIMESTAMP`, optional `(p)` | Resolve to NTZ/LTZ/TZ only from an explicit `timestampTypeMapping`; retain p, default 9 | explicit resolved `TIMESTAMP_* (p)` | context-free import; invalid mapping or precision | all three mappings and fail-closed missing context |
| `VARIANT` | `VARIANT`; no parameters | `VARIANT` | parameters | canonical/invalid cases |
| `OBJECT` | parameterless semi-structured `OBJECT` | `OBJECT` | structured `OBJECT(...)` in this wave | canonical plus fail-closed structured case |
| `ARRAY` | parameterless semi-structured `ARRAY` | `ARRAY` | structured `ARRAY(...)` in this wave | canonical plus fail-closed structured case |
| `GEOGRAPHY` | `GEOGRAPHY`; no type parameters | `GEOGRAPHY` | parameters | canonical/invalid cases |
| `GEOMETRY` | `GEOMETRY`; no type parameters | `GEOMETRY` | parameters; object SRID is not a type argument | canonical/invalid cases |
| `VECTOR(INT,d)`, `VECTOR(FLOAT,d)` | `VECTOR`; retain `element_type` exactly as `INT` or `FLOAT`, and integer `dimension` | `VECTOR(element_type, d)` | bare VECTOR; aliases as element type; missing/extra args; d outside 1..4096 | both elements, boundaries, invalid matrix, exact round trip |

`DECFLOAT`, structured ARRAY/OBJECT/MAP, FILE, UUID, UNKNOWN, user-defined
types, and collations are not silently mapped. They remain explicitly unsupported
and fail closed in Wave 2A.

## Alias Policy

- SQL aliases above are accepted case-insensitively and normalize immediately.
- Alias spelling is not a semantic round-trip requirement; canonical family and
  effective parameters are.
- `FIXED`, `TEXT`, and `REAL` may also appear as driver/SHOW metadata tokens.
  The metadata adapter may normalize these tokens, but undocumented `FIXED` is
  not added to the user DDL grammar as a NUMBER synonym.
- Integer aliases never accept parameters.
- `CHAR`/`CHARACTER`/`NCHAR` retain their distinct default-length rule before
  normalizing to VARCHAR.
- Generic `TIMESTAMP` is session-dependent. Offline DDL import must receive an
  explicit mapping option or reject it. Reverse engineering receives the stored
  concrete TIMESTAMP variation. The editor should offer explicit variants, not
  create a context-dependent canonical type.

## VECTOR Decision

`VECTOR` receives first-class `element_type` and `dimension` fields; it is never
encoded by overloading numeric precision or string length. The editor may use
its existing `field.size` transport as the string `FLOAT,256` or `INT,16`, but
must provide VECTOR-specific validation and labels before conversion.

Reverse engineering will augment generic COLUMNS metadata only for tables that
contain VECTOR columns, using a trusted `DESCRIBE TABLE <validated name>` query
to recover the full canonical type signature. It must not guess missing VECTOR
arguments. Tests must fix the driver-row contract before any optional live
verification.

Legacy saved bare VECTOR values remain loadable as explicitly incomplete
editor state. They are not assigned a default element or dimension. Save may
preserve the incomplete state, but Snowflake DDL and Terraform export must fail
with a targeted correction message until both values are supplied.

## CHECK Flow and Decision

Current flow is loss-only:

```text
DDL CHECK -> parser explicitly rejects
Snowflake CHECK -> service never queries CHECK_CONSTRAINTS
field.check -> drawdb_document only -> diagramToCanonicalProject drops it
canonical model -> no CHECK kind/expression -> renderers cannot emit it
Terraform -> only PK/UNIQUE/FK -> CHECK would disappear
```

Model v2 adds a discriminated canonical constraint:

```json
{
  "id": "constraint:ANALYTICS.CORE.EVENTS.CK_EVENTS_AMOUNT",
  "name": "CK_EVENTS_AMOUNT",
  "kind": "check",
  "columns": [],
  "referenced_table_id": null,
  "referenced_columns": [],
  "expression": "AMOUNT >= 0"
}
```

- `expression` is required and nonblank only for `kind: "check"`; it is `null`
  for PK/UNIQUE/FK in v2.
- Expression text is the trimmed content inside `CHECK (...)`. It is opaque SQL:
  scanners preserve nested parentheses and quoted strings but do not evaluate,
  rewrite identifiers, or build an incomplete expression AST.
- `columns` is empty because CHECK metadata does not provide a dependable
  dependency list and a check may refer to multiple columns.
- Named checks preserve their name. Unnamed DDL checks receive a deterministic
  `CK_<TABLE>_<ordinal>` name and are emitted named; the naming change is
  documented, while the enforced predicate remains exact.
- DDL import accepts column-level, named/unnamed table-level, and
  `ALTER TABLE ... ADD [CONSTRAINT ...] CHECK (...)` forms.
- DDL export emits `CONSTRAINT <name> CHECK (<expression>)` inside CREATE TABLE.
  It never appends `NOT ENFORCED`; Snowflake CHECK is enforced on standard
  tables. Unsupported validation properties are rejected, not stripped.
- Reverse engineering adds a bounded `INFORMATION_SCHEMA.CHECK_CONSTRAINTS`
  query and joins its rows to selected base tables by catalog/schema/table/name.
- The diagram gains `table.checkConstraints: [{id,name,expression}]`. A minimal
  Table Info editor makes imported checks visible and editable. Existing
  `field.check` remains for other databases; for Snowflake, legacy nonblank
  field checks migrate deterministically into table checks. Snowflake type
  changes must not clear them.
- Logical-model proposals do not gain a new CHECK-generation language in this
  wave. They preserve existing table checks. A proposal that removes or renames
  a column in a table with opaque checks must fail closed rather than leave a
  possibly stale expression.
- Terraform CHECK provider syntax is not assumed. Until the installed provider
  schema is separately verified, Terraform import rejects CHECK resources and
  Terraform export rejects canonical projects containing CHECK with an explicit
  unsupported-semantic error. Silent omission is forbidden; no `terraform
  apply` is run.

## Compatibility and Versioning

- This semantic schema change requires `project_version: "2"` and
  `physical_model.model_version: "2"`. The v2 writer emits the seven-key type
  shape, the constraint `expression` discriminator, and diagram
  `checkConstraints` where applicable.
- The reader continues to accept v1. It fills new nonapplicable type fields with
  null, resolves documented omitted defaults, gives v1 PK/UQ/FK
  `expression:null`, and promotes legacy Snowflake `field.check` values.
- A v1 bare VECTOR is the one non-inferable case and migrates to incomplete
  editor state, not an invented valid type. Export is blocked until corrected.
- v2 loading must reconcile `physical_model` and `drawdb_document`; a stale raw
  document may not hide or overwrite canonical checks. Canonical CHECK data is
  authoritative, while editor layout remains sourced from the document.
- v1 files without CHECK or VECTOR remain behaviorally unchanged. No Electron
  preload/runtime version bump is required because IPC shape is unchanged.
- This is the only persistence work authorized: read-v1/write-v2 compatibility
  necessary for the semantic-model change. File registration, OS behavior,
  dirty tracking, and general migration infrastructure remain Wave 3.

## Test-Quality Gaps

- The extended-type test positively asserts invalid bare `VECTOR` DDL.
- DDL parser tests omit aliases, omitted parameters, full timestamp variants,
  VECTOR arguments, and CHECK forms.
- Metadata tests omit VECTOR, CHECK, alias divergence, malformed parameters,
  and unknown nullability behavior.
- The mocked “live connection” test proves only its own expected fake driver
  shape; it does not prove real Snowflake metadata behavior.
- The opt-in live round-trip compares table names, type families, and relationship
  names. It does not compare precision, scale, length, VECTOR arguments,
  nullability, defaults, comments, ordinals, constraint content, or the complete
  canonical semantic projection.
- Terraform tests use only the seven-family subset and a shared parser/exporter,
  so common loss can appear as parity.
- Logical-model tests do not prove family-specific type validation or safe CHECK
  preservation during structural edits.
- UI tests do not exercise alias selection, VECTOR editing, CHECK editing, or
  reopen preservation.

Semantic parity must compare a full explicit snapshot of namespaces, tables,
ordered columns, seven-key data types, nullability, defaults, comments, all
constraint names/kinds/columns/expressions, and relationships. It may ignore
only documented lexical aliases and deterministic ordering; it may not discard
fields before comparison.

## Ticket 2A-1: Canonical Type Model and Compatibility

Goal: create the single type contract, v1-to-v2 compatibility, correct canonical
shape, and valid editor representation including VECTOR.

Allowed production files:

- `src/erdTool/snowflakeTypeContract.js` (new)
- `src/erdTool/projectAdapter.js`
- `src/data/datatypes.js`
- `src/components/EditorSidePanel/TablesTab/TableField.jsx`
- `src/components/EditorSidePanel/TablesTab/FieldDetails.jsx`
- `src/erdTool/logicalModel.js`

Allowed tests:

- `src/erdTool/projectAdapter.test.js`
- `tests/logical-model.test.mjs`
- `tests/test-snowflake-ddl-export.test.mjs`

Worker: Luna Max implementation; separate Luna Max semantic review. Gemini may
expand already-approved table fixtures but may not decide rules.

Tests: seven-key validation, every default/boundary, v1 read/v2 write, incomplete
legacy VECTOR, VECTOR UI transport, alias-to-canonical conversion, and logical
model family-specific rejection.

Non-goals: DDL grammar, metadata queries, CHECK, Terraform, identifiers.

Done: no caller defines conflicting bounds/defaults; every supported canonical
type validates and renders through the shared module; invalid new VECTOR cannot
export; old files remain loadable.

## Ticket 2A-2: Parser, Renderer, Metadata, and Terraform Type Fidelity

Goal: route every non-UI type boundary through the approved contract and prove
semantic type round trips.

Allowed production files:

- `src/erdTool/snowflakeTypeContract.js`
- `src/erdTool/projectAdapter.js`
- `src/erdTool/snowflakeMetadata.js`
- `src/electron/snowflakeService.js`
- `src/erdTool/terraformRoundTrip.js`
- `src/utils/importSQL/snowflake.js` only if the explicit TIMESTAMP mapping option
  must be forwarded

Allowed tests:

- `src/erdTool/projectAdapter.test.js`
- `tests/snowflake-ddl-import-integration.test.mjs`
- `tests/test-snowflake-ddl-export.test.mjs`
- `tests/snowflake-metadata-reverse-engineering.test.mjs`
- `tests/snowflake-live-connection.test.mjs`
- `tests/terraform-round-trip.test.mjs`

Worker: Luna Max implementation and independent Luna Max review. Gemini may
write repetitive approved alias/invalid fixtures after the Luna implementation.

Tests: full table above across DDL and Terraform, exact metadata mapping,
VECTOR DESCRIBE merge, TIMESTAMP mapping context, parser-renderer idempotence,
and explicit unsupported structured/new types.

Non-goals: CHECK, live execution, namespace/identifier changes, default-expression
policy, provider apply validation.

Done: all boundaries use one rule source; full supported type semantics survive;
Terraform either round-trips a supported canonical type or rejects it explicitly.

## Ticket 2A-3: CHECK Preservation

Goal: carry CHECK without loss from DDL/metadata through canonical/editor state
and back to DDL, while making unsupported Terraform behavior explicit.

Allowed production files:

- `src/erdTool/projectAdapter.js`
- `src/erdTool/snowflakeMetadata.js`
- `src/electron/snowflakeService.js`
- `src/erdTool/logicalModel.js`
- `src/data/schemas.js`
- `src/data/datatypes.js`
- `src/components/EditorSidePanel/TablesTab/TableField.jsx`
- `src/components/EditorSidePanel/TablesTab/TableInfo.jsx`
- `src/components/EditorSidePanel/TablesTab/CheckConstraintDetails.jsx` (new)
- `src/erdTool/terraformRoundTrip.js`

Allowed tests:

- `src/erdTool/projectAdapter.test.js`
- `tests/snowflake-ddl-import-integration.test.mjs`
- `tests/test-snowflake-ddl-export.test.mjs`
- `tests/snowflake-metadata-reverse-engineering.test.mjs`
- `tests/snowflake-live-connection.test.mjs`
- `tests/logical-model.test.mjs`
- `tests/terraform-round-trip.test.mjs`

Worker: Luna Max implementation; separate Luna Max parser/security and semantic
review. Gemini may add approved expression fixtures only.

Tests: named/unnamed column/table/ALTER checks; nesting and quoted strings;
metadata join; canonical-diagram-canonical preservation; UI add/edit/delete and
undo; v1 field migration; no `NOT ENFORCED`; Terraform fail-closed; structural
logical edits fail closed rather than stale a predicate.

Non-goals: full SQL expression AST, identifier-aware expression rewriting,
CHECK on nonstandard table kinds, Terraform provider/apply support.

Done: no supported path silently strips a CHECK; exact predicate text and name
survive; invalid/unsupported paths return an actionable error.

## Ticket 2A-4: Deterministic Semantic Matrix and Final Gate

Goal: replace self-referential parity with independent expected semantic
snapshots and exercise the completed contract without live Snowflake execution.

Allowed files (tests only):

- `src/erdTool/projectAdapter.test.js`
- `tests/logical-model.test.mjs`
- `tests/snowflake-ddl-import-integration.test.mjs`
- `tests/test-snowflake-ddl-export.test.mjs`
- `tests/snowflake-metadata-reverse-engineering.test.mjs`
- `tests/snowflake-live-connection.test.mjs`
- `tests/snowflake-live-roundtrip.test.mjs`
- `tests/terraform-round-trip.test.mjs`
- `tests/interaction-user.test.mjs`

Worker: Gemini 3.8 for the repetitive matrix after Sol supplies exact fixtures;
Luna Max reviews assertion quality; Sol Medium runs the final gate and decides
acceptance.

Tests: table-driven aliases/defaults/bounds; independent full semantic snapshot;
CHECK and VECTOR UI flow; live harness assertions upgraded but kept opt-in and
not executed in this wave.

Non-goals: broader Wave 4 web/Electron harness expansion, relationship drag,
New/Open/Save program expansion, or live deployment.

Done: no test obtains “parity” by deleting unsupported fields; each required
semantic field has a positive preservation assertion and a negative invalid-case
assertion.

## Execution Order and Gates

1. 2A-1 establishes the only approved model and compatibility behavior.
2. Sol reviews 2A-1 against this table before 2A-2 starts.
3. 2A-2 routes parser/renderer/metadata/Terraform type behavior through it.
4. Sol and an independent Luna reviewer inspect the type diff.
5. 2A-3 adds CHECK using the now-versioned model.
6. Sol and an independent Luna reviewer inspect CHECK parsing, loss paths, and
   Terraform fail-closed behavior.
7. 2A-4 expands deterministic tests and strengthens the opt-in live harness.
8. Final offline gate:

```text
npm run lint
npm test
npm run test:browser
npm run test:user
```

Focused tests should also be run directly during each ticket. `npm run
test:live`, `terraform apply`, GUI deployment, and arbitrary renderer SQL are
forbidden in Wave 2A.

## Preservation, Rollback, and Global Definition of Done

- Work remains on `remediation/d161-deploy-boundary`; no force push, reset,
  amend, or rewrite of accepted/preserved history.
- Each ticket is a separate reviewable commit and can be reverted normally.
- Any production file outside a ticket allowlist requires a written contract
  amendment before editing.
- The accepted Wave 1 D161 boundary and its tests remain green.
- Every supported type and alias satisfies the table above at all relevant
  boundaries.
- VECTOR can never render without valid element type and dimension.
- CHECK can never be silently discarded by DDL, metadata, editor, logical, save,
  or Terraform paths.
- Existing v1 projects remain loadable; new semantic state writes v2.
- Full offline validation passes with exact results recorded.
- Independent Luna review finds no semantic omission or weakened assertion.
- No Wave 2B, Wave 3, Wave 4, or live Snowflake work is included.

Planning verdict: **WAVE 2A READY FOR IMPLEMENTATION**.
