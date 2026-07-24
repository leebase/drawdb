## Checks Run

`python3 -m compileall scripts/check_web_smoke.py` exited 0 and compiled the smoke checker successfully. I also inspected `tests/snowflake-ddl-import-integration.test.mjs` and `artifacts/user-smoke/result.json`; the smoke evidence reports `check_exit_code: 0` and no blocking errors.

## Lens Notes

Correctness and model fidelity are mostly sound for the supported Snowflake subset: raw Snowflake SQL bypasses the generic SQL parser, dispatches to `parseSnowflakeDDLToDiagram`, preserves namespace/table/field/constraint shape, and surfaces unsupported syntax as explicit `Error` messages. Existing database import behavior is mostly preserved because non-Snowflake branches still receive their ASTs and existing `diagramDb` argument. The main gap is UI workflow fidelity: Snowflake imports launched from the generic source-import menu do not update the active database from `generic` to `snowflake`, even though the imported diagram data identifies itself as Snowflake. Offline and credential-safety review found no network or credential handling in the DDL import path.
