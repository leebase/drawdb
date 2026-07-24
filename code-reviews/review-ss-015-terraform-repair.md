# SS-015 Terraform Repair Review

Scope reviewed: `src/erdTool/terraformRoundTrip.js`,
`src/erdTool/terraform.ts`, `src/erdTool/projectAdapter.js`,
`src/components/EditorHeader/Modal/Modal.jsx`,
`src/components/EditorHeader/Modal/ImportSource.jsx`, existing Terraform UI
wiring in `src/components/EditorHeader/ControlPanel.jsx`, and
`tests/terraform-round-trip.test.mjs`.

Verdict: **pass**. The prior High default-classification defect and the
actionable Medium/Low repair items found during the timed-out review have been
fixed and pinned by tests. No Terraform state, credentials, provider secrets, or
Terraform CLI execution are introduced.

## Checks Run

- `node tests/terraform-round-trip.test.mjs` — exit code 0; 11 Terraform
  subtests passed.
- `node tests/electron-runtime.test.mjs` — exit code 0; 38 Electron/native
  bridge subtests passed.
- `npm run test` — exit code 0; 11 test files passed, 0 failed.
- `npm run lint` — exit code 0.
- `npm run build` — exit code 0. Existing Vite warnings remain for direct eval
  in `lottie-web` and large chunks.
- `npm run build:desktop` — exit code 0. Existing Vite warnings remain for the
  desktop renderer; Electron main/preload artifacts built successfully.

## Findings

No High, Critical, Medium, or Low product findings remain in the repaired scope.

## Repair Evidence

The Terraform exporter now uses the Snowflake default-expression classifier
shared with canonical Snowflake DDL rendering. Parenless Snowflake defaults such
as `CURRENT_DATE` and `NULL` export as Terraform `expression`; call-shaped
literals such as `ABC(1)` export as Terraform `constant`.

Terraform quoted string handling now escapes generated `${` and `%{` template
markers and decodes escaped `$${` and `%%{` back to literal text. Unescaped
interpolation and template directives are rejected explicitly.

Terraform block handling now rejects `terraform { cloud ... }`, backend/state
configuration, and unsupported `terraform` block contents instead of silently
dropping them.

Schema-to-schema `database` references are resolved against the full resource
graph with cycle detection, so declaration or module-file order no longer
changes successful import semantics.

Table namespaces now reject explicit database/schema mismatches when `schema`
references a `snowflake_schema` resource.

Terraform string-only attributes now reject boolean and numeric HCL literals
instead of coercing them into Snowflake identifiers.

Nested Terraform block handling now rejects labels on `default`,
`foreign_key_properties`, and `references` blocks, and rejects unsupported
attributes or blocks inside `foreign_key_properties`.

The Terraform import modal applies the imported diagram database, so importing
Snowflake Terraform from a Generic diagram switches the diagram to Snowflake and
makes Terraform export reachable. The Terraform upload filter now advertises
only `.tf`, not `.tfvars`.

## Residual Risk

Module-directory selection remains represented by the programmatic multi-file
input API rather than a native directory picker in this web upload control. This
does not block SS-015 import/export semantics, and no Terraform state,
credentials, or `terraform apply` path is added.
