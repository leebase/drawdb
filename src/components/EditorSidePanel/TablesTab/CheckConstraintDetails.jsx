import { useEffect, useMemo, useState } from "react";
import { Button, Input, TextArea, Toast } from "@douyinfe/semi-ui";
import { IconDeleteStroked } from "@douyinfe/semi-icons";
import { Action, DB, ObjectType } from "../../../data/constants";
import { useDiagram, useLayout, useUndoRedo } from "../../../hooks";
import { useTranslation } from "react-i18next";
import {
  getSnowflakeTableChecks,
  SnowflakeCheckError,
  validateSnowflakeCheckExpression,
} from "../../../erdTool/projectAdapter.js";

const SNOWFLAKE_IDENTIFIER = /^[A-Z_][A-Z0-9_$]*$/;

// The adapter is intentionally fail-closed.  Keep that failure visible in
// the editor instead of letting malformed imported CHECK metadata abort the
// whole table panel.  This wrapper does not reinterpret SQL; it only ensures
// every UI caller receives a typed error.
export function readSnowflakeTableChecks(table) {
  try {
    return { checks: getSnowflakeTableChecks(table), error: null };
  } catch (error) {
    const typedError =
      error?.name === "SnowflakeCheckError" && error?.code
        ? error
        : new SnowflakeCheckError(
            "SNOWFLAKE_CHECK_INVALID",
            error?.message || "CHECK metadata could not be validated.",
          );
    return { checks: [], error: typedError };
  }
}

function normalizeConstraintName(value) {
  const name = String(value ?? "").trim().toUpperCase();
  if (!name) return { value: name, error: "CHECK constraint name is required." };
  if (name.length > 255) {
    return {
      value: name,
      error: "CHECK constraint name must be at most 255 characters.",
    };
  }
  if (!SNOWFLAKE_IDENTIFIER.test(name)) {
    return {
      value: name,
      error:
        "CHECK constraint name must be an uppercase Snowflake identifier (letters, numbers, _, or $).",
    };
  }
  return { value: name, error: null };
}

function validatedExpression(value) {
  const expression = String(value ?? "").trim();
  if (!expression) throw new Error("CHECK expression is required.");

  // The adapter owns the lexical CHECK contract and returns the accepted
  // expression with only outer whitespace removed.
  return validateSnowflakeCheckExpression(expression);
}

function sameChecks(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export default function CheckConstraintDetails({
  data,
  tid,
  isDraft = false,
  onCommitted,
  onCanceled,
}) {
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { tables, database, updateTable } = useDiagram();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const table = useMemo(() => tables.find((item) => item.id === tid), [tables, tid]);
  const checkState = useMemo(() => {
    if (database === DB.SNOWFLAKE && table) {
      return readSnowflakeTableChecks(table);
    }
    return { checks: table?.checkConstraints ?? [], error: null };
  }, [database, table]);
  const { checks, error: checkError } = checkState;
  const [draft, setDraft] = useState({
    name: data?.name ?? "",
    expression: data?.expression ?? "",
  });
  const [error, setError] = useState("");

  useEffect(() => {
    setDraft({
      name: data?.name ?? "",
      expression: data?.expression ?? "",
    });
    setError("");
  }, [data?.id, data?.name, data?.expression]);

  const commitChecks = (
    nextChecks,
    previousChecks,
    previousRawChecks,
    nextFields,
    previousFields,
    message,
  ) => {
    const fieldsChanged = nextFields !== null;
    if (
      sameChecks(nextChecks, previousChecks) &&
      (!fieldsChanged || sameChecks(nextFields, previousFields))
    ) {
      return true;
    }
    const result = updateTable(tid, {
      checkConstraints: nextChecks,
      ...(fieldsChanged ? { fields: nextFields } : {}),
    });
    if (result?.name === "SnowflakeCheckError") {
      setError(result.message);
      return false;
    }
    setUndoStack((previous) => [
      ...previous,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "self",
        tid,
        undo: {
          checkConstraints: previousRawChecks,
          ...(fieldsChanged ? { fields: previousFields } : {}),
        },
        redo: {
          checkConstraints: nextChecks,
          ...(fieldsChanged ? { fields: nextFields } : {}),
        },
        message,
      },
    ]);
    setRedoStack([]);
    return true;
  };

  const save = () => {
    if (layout.readOnly) return;
    const normalizedName = normalizeConstraintName(draft.name);
    if (normalizedName.error) {
      setError(normalizedName.error);
      Toast.error(normalizedName.error);
      return;
    }
    let expression;
    try {
      expression = validatedExpression(draft.expression);
    } catch (validationError) {
      const message = validationError?.message || "CHECK expression is invalid.";
      setError(message);
      Toast.error(message);
      return;
    }

    const nextCheck = {
      id: data.id,
      name: normalizedName.value,
      expression,
    };
    const previousChecks = [...checks];
    const candidateChecks = isDraft
      ? [...previousChecks, nextCheck]
      : previousChecks.map((check) =>
          check.id === data.id ? { ...check, ...nextCheck } : check,
        );

    // Materialize legacy field.check predicates into table.checkConstraints
    // on the first explicit CHECK edit.  Clearing the legacy transport in the
    // same atomic table update prevents the adapter from regenerating a
    // deleted/renamed predicate on the next render.  The complete candidate is
    // validated before state or history changes, including PK/UQ name
    // collisions and duplicate checks.
    const previousFields = table?.fields ?? [];
    const hasLegacyChecks = previousFields.some(
      (field) => typeof field.check === "string" && field.check.trim(),
    );
    const nextFields = hasLegacyChecks
      ? previousFields.map((field) =>
          typeof field.check === "string" && field.check.trim()
            ? { ...field, check: "" }
            : field,
        )
      : null;
    let nextChecks;
    try {
      const candidateIds = new Set();
      const candidateNames = new Set();
      for (const check of candidateChecks) {
        const id = String(check?.id ?? "").trim();
        const name = String(check?.name ?? "").trim().toUpperCase();
        if (!id || candidateIds.has(id)) {
          throw new SnowflakeCheckError(
            "SNOWFLAKE_CHECK_INVALID",
            "CHECK constraints must have unique nonblank ids.",
          );
        }
        if (!name || candidateNames.has(name)) {
          throw new SnowflakeCheckError(
            "SNOWFLAKE_CHECK_INVALID",
            `CHECK constraint names must be unique on ${table?.name ?? "this table"}.`,
          );
        }
        candidateIds.add(id);
        candidateNames.add(name);
      }
      nextChecks = getSnowflakeTableChecks({
        ...table,
        ...(nextFields ? { fields: nextFields } : {}),
        checkConstraints: candidateChecks,
      });
    } catch (validationError) {
      const message = validationError?.message || "CHECK constraint is invalid.";
      setError(message);
      Toast.error(message);
      return;
    }
    const previousRawChecks = Object.prototype.hasOwnProperty.call(
      table ?? {},
      "checkConstraints",
    )
      ? [...(table.checkConstraints ?? [])]
      : undefined;
    const committed = commitChecks(
      nextChecks,
      previousChecks,
      previousRawChecks,
      nextFields,
      previousFields,
      t("edit_table", {
        tableName: table?.name ?? "",
        extra: "[CHECK constraint]",
      }),
    );
    if (committed) {
      setError("");
      onCommitted?.(nextCheck);
    }
  };

  const remove = () => {
    if (layout.readOnly || isDraft) {
      onCanceled?.();
      return;
    }
    const previousChecks = [...checks];
    const candidateChecks = previousChecks.filter(
      (check) => check.id !== data.id,
    );
    const previousFields = table?.fields ?? [];
    const hasLegacyChecks = previousFields.some(
      (field) => typeof field.check === "string" && field.check.trim(),
    );
    const nextFields = hasLegacyChecks
      ? previousFields.map((field) =>
          typeof field.check === "string" && field.check.trim()
            ? { ...field, check: "" }
            : field,
        )
      : null;
    let nextChecks;
    try {
      const candidateIds = new Set();
      const candidateNames = new Set();
      for (const check of candidateChecks) {
        const id = String(check?.id ?? "").trim();
        const name = String(check?.name ?? "").trim().toUpperCase();
        if (!id || candidateIds.has(id)) {
          throw new SnowflakeCheckError(
            "SNOWFLAKE_CHECK_INVALID",
            "CHECK constraints must have unique nonblank ids.",
          );
        }
        if (!name || candidateNames.has(name)) {
          throw new SnowflakeCheckError(
            "SNOWFLAKE_CHECK_INVALID",
            `CHECK constraint names must be unique on ${table?.name ?? "this table"}.`,
          );
        }
        candidateIds.add(id);
        candidateNames.add(name);
      }
      nextChecks = getSnowflakeTableChecks({
        ...table,
        ...(nextFields ? { fields: nextFields } : {}),
        checkConstraints: candidateChecks,
      });
    } catch (validationError) {
      const message = validationError?.message || "CHECK constraint is invalid.";
      setError(message);
      Toast.error(message);
      return;
    }
    const previousRawChecks = Object.prototype.hasOwnProperty.call(
      table ?? {},
      "checkConstraints",
    )
      ? [...(table.checkConstraints ?? [])]
      : undefined;
    const committed = commitChecks(
      nextChecks,
      previousChecks,
      previousRawChecks,
      nextFields,
      previousFields,
      t("edit_table", {
        tableName: table?.name ?? "",
        extra: "[delete CHECK constraint]",
      }),
    );
    if (committed) onCommitted?.(null);
  };

  if (checkError) {
    return (
      <div
        className="text-xs text-red-600 mb-3"
        role="alert"
        data-testid={`snowflake-check-error-${data.id}`}
      >
        CHECK constraints could not be validated: {checkError.message}
      </div>
    );
  }

  return (
    <div
      className="flex items-start gap-2 mb-3"
      data-testid={`snowflake-check-constraint-${data.id}`}
    >
      <div className="flex-1 min-w-0">
        <Input
          value={draft.name}
          placeholder="CHECK name"
          readonly={layout.readOnly}
          aria-label="CHECK constraint name"
          data-testid={`snowflake-check-name-${data.id}`}
          validateStatus={
            error && !String(draft.name).trim() ? "error" : "default"
          }
          onChange={(value) => {
            setDraft((previous) => ({ ...previous, name: value }));
            setError("");
          }}
        />
        <TextArea
          className="mt-2"
          value={draft.expression}
          placeholder="CHECK expression"
          readonly={layout.readOnly}
          autosize
          rows={2}
          aria-label="CHECK expression"
          data-testid={`snowflake-check-expression-${data.id}`}
          onChange={(value) => {
            setDraft((previous) => ({ ...previous, expression: value }));
            setError("");
          }}
        />
        {error && (
          <div className="text-xs text-red-600 mt-1" role="alert">
            {error}
          </div>
        )}
        <div className="flex gap-2 mt-2">
          <Button
            size="small"
            type="primary"
            disabled={layout.readOnly}
            onClick={save}
            data-testid={`snowflake-save-check-${data.id}`}
          >
            {t("save")}
          </Button>
          {isDraft && (
            <Button
              size="small"
              disabled={layout.readOnly}
              onClick={onCanceled}
              data-testid={`snowflake-cancel-check-${data.id}`}
            >
              {t("cancel")}
            </Button>
          )}
        </div>
      </div>
      {!isDraft && (
        <Button
          size="small"
          type="danger"
          theme="light"
          icon={<IconDeleteStroked />}
          title="Delete CHECK constraint"
          aria-label="Delete CHECK constraint"
          disabled={layout.readOnly}
          onClick={remove}
          data-testid={`snowflake-delete-check-${data.id}`}
        />
      )}
    </div>
  );
}
