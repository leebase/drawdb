## Checks Run

`python3 -m compileall scripts/check_web_smoke.py` exited 0 and compiled the smoke-check script successfully. Per instruction, no other exploratory commands are recorded in checks_run.

## Lens Notes

The Snowflake default-function recognizer now requires an allowlisted function name and a balanced call whose closing parenthesis is the final trimmed character. The focused regression cases confirm CURRENT_TIMESTAMP(), UUID_STRING(), TO_DATE(...), spaced calls, and nested DATEADD(...) remain executable SQL, while CURRENT_TIMESTAMPED(), CURRENT_TIMESTAMP() + 1, UUID_STRING()), TO_DATE(...)::DATE, and malformed TO_DATE(...) are emitted as quoted ambiguous strings. `artifacts/user-smoke/result.json` reports app startup and core flow completion with `check_exit_code` 0 and no blocking errors.
