# ERD Tool Patch History

## Foundation

- Upstream: https://github.com/drawdb-io/drawdb
- Public fork: https://github.com/leebase/drawdb
- Fork base: `b24ad20b6588b9b99609e8a03b87efa7b28cf245`
- License: GNU AGPL-3.0; the upstream `LICENSE` remains unchanged.

## 2026-07-10 — Canonical project and Snowflake integration

- Added strict canonical-project adapters while retaining drawDB's existing
  React editor, table/field editor, relationship canvas, drag behavior, and
  browser-local persistence.
- Added Snowflake as an editor database choice with the canonical type families
  used by ERD Tool.
- Added project open/save, automatic layout, and informational Snowflake DDL
  actions to the existing editor header.
- Added deterministic adapter and real-layout tests using Node's built-in test
  runner.
- Added `elkjs` as the automatic layout runtime.

The evaluated elkjs source reference was
`87f373f5697675f94de210f7d07170d7f2f97391` (upstream version `0.12.0`). That
commit does not publish a runnable npm artifact, and a clean local build failed
inside upstream Xtext generation. The runtime therefore uses exact published
package `elkjs@0.11.1`, corresponding to upstream tag commit
`572e73323791d05f09b0815ff639af2b67f202ab`. No compiled files from different
versions are mixed, and there is no networked postinstall workaround.

Future elkjs upgrades must use one reproducible published or locally built
artifact, rerun `src/erdTool/elkLayout.test.js`, and update this record.
