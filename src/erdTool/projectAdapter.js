import {
  SNOWFLAKE_TYPE_ALIASES,
  assertSnowflakeTypeExportable,
  canonicalizeSnowflakeType,
  canonicalizeSnowflakeTypeFromField,
  fieldSizeFromSnowflakeType,
  snowflakeTypeText,
  validateSnowflakeType,
} from "./snowflakeTypeContract.js";

const PROJECT_VERSION = "2";
const MODEL_VERSION = "2";
const LEGACY_PROJECT_VERSION = "1";
const LEGACY_MODEL_VERSION = "1";
const SNOWFLAKE_IDENTIFIER_MAX_LENGTH = 255;
export const SNOWFLAKE_CHECK_ERROR_CODES = Object.freeze({
  INVALID: "SNOWFLAKE_CHECK_INVALID",
  LOSS: "SNOWFLAKE_CHECK_LOSS",
  UNSUPPORTED: "SNOWFLAKE_CHECK_UNSUPPORTED",
  STRUCTURAL_EDIT: "SNOWFLAKE_CHECK_STRUCTURAL_EDIT",
});
const SNOWFLAKE_CHECK_CODE_SET = new Set(
  Object.values(SNOWFLAKE_CHECK_ERROR_CODES),
);

/**
 * A machine-distinguishable CHECK boundary error.
 *
 * Ticket 2A-3 callers historically used both `(code, message)` and
 * `(message, code)`, so accept either order while always exposing the same
 * stable `name` and `code` fields.
 */
export class SnowflakeCheckError extends Error {
  constructor(first, second) {
    const firstIsCode = SNOWFLAKE_CHECK_CODE_SET.has(first);
    const secondIsCode = SNOWFLAKE_CHECK_CODE_SET.has(second);
    const code = firstIsCode
      ? first
      : secondIsCode
        ? second
        : SNOWFLAKE_CHECK_ERROR_CODES.INVALID;
    const message = firstIsCode
      ? second
      : secondIsCode
        ? first
        : first;
    const detail =
      typeof message === "string" && message.trim()
        ? message
        : `${code} boundary failure`;
    super(`${code}: ${detail}`);
    this.name = "SnowflakeCheckError";
    this.code = code;
  }
}
const SENSITIVE_PROJECT_KEY =
  /credential|password|passphrase|secret|token|connection|account|warehouse|role|session|api[_-]?key|private[_-]?key|access[_-]?key|auth(?:entication)?/i;
const SUPPORTED_DRAWDB_DATABASES = new Set([
  "mysql",
  "postgresql",
  "transactsql",
  "sqlite",
  "mariadb",
  "oraclesql",
  "snowflake",
  "generic",
]);

const TOP_LEVEL_ALLOWED = new Set([
  "project_version",
  "physical_model",
  "diagram_layout",
  "drawdb_document",
]);
const DRAWDB_DOCUMENT_KEYS = new Set([
  "database",
  "title",
  "tables",
  "relationships",
  "notes",
  "areas",
  "types",
  "enums",
  "transform",
]);
const PHYSICAL_MODEL_KEYS = new Set([
  "model_version",
  "name",
  "namespaces",
  "tables",
  "relationships",
]);
const NAMESPACE_KEYS = new Set(["id", "catalog", "schema"]);
const TABLE_KEYS = new Set([
  "id",
  "namespace_id",
  "name",
  "kind",
  "columns",
  "constraints",
  "comment",
]);
const COLUMN_KEYS = new Set([
  "id",
  "name",
  "ordinal",
  "data_type",
  "nullable",
  "default",
  "comment",
]);
const LEGACY_DATA_TYPE_KEYS = new Set([
  "family",
  "text",
  "precision",
  "scale",
  "length",
]);
const CONSTRAINT_KEYS = new Set([
  "id",
  "name",
  "kind",
  "columns",
  "referenced_table_id",
  "referenced_columns",
  "expression",
]);
const RELATIONSHIP_KEYS = new Set([
  "id",
  "name",
  "source_table_id",
  "source_column_ids",
  "target_table_id",
  "target_column_ids",
  "cardinality",
]);
const LAYOUT_KEYS = new Set(["nodes", "viewport"]);
const VIEWPORT_KEYS = new Set(["x", "y", "zoom"]);
const NODE_KEYS = new Set(["x", "y"]);
const DRAWDB_TABLE_KEYS = new Set([
  "id",
  "name",
  "x",
  "y",
  "fields",
  "comment",
  "locked",
  "hidden",
  "collapsed",
  "indices",
  "uniqueConstraints",
  "color",
  "inherits",
  "namespace",
  "constraintView",
  "checkConstraints",
]);
const DRAWDB_FIELD_KEYS = new Set([
  "id",
  "name",
  "type",
  "default",
  "check",
  "primary",
  "unique",
  "unsigned",
  "notNull",
  "increment",
  "comment",
  "size",
  "values",
  "isArray",
]);
const DRAWDB_INDEX_KEYS = new Set(["id", "name", "unique", "fields"]);
const DRAWDB_UNIQUE_CONSTRAINT_KEYS = new Set(["id", "name", "fields"]);
const DRAWDB_RELATIONSHIP_KEYS = new Set([
  "id",
  "name",
  "startTableId",
  "startFieldId",
  "endTableId",
  "endFieldId",
  "fields",
  "cardinality",
  "updateConstraint",
  "deleteConstraint",
]);
const DRAWDB_RELATIONSHIP_FIELD_KEYS = new Set(["startFieldId", "endFieldId"]);
const DRAWDB_NOTE_KEYS = new Set([
  "id",
  "x",
  "y",
  "title",
  "content",
  "color",
  "height",
  "width",
  "locked",
]);
const DRAWDB_AREA_KEYS = new Set([
  "id",
  "name",
  "x",
  "y",
  "width",
  "height",
  "locked",
  "color",
]);
const DRAWDB_TYPE_KEYS = new Set(["id", "name", "fields", "comment"]);
const DRAWDB_TYPE_FIELD_KEYS = new Set([
  "id",
  "name",
  "type",
  "values",
  "size",
]);
const DRAWDB_ENUM_KEYS = new Set(["id", "name", "values"]);
const DRAWDB_NAMESPACE_KEYS = new Set(["id", "catalog", "schema"]);
const DRAWDB_CONSTRAINT_VIEW_KEYS = new Set(["primaryKeyName", "uniqueNames"]);
const DRAWDB_CHECK_CONSTRAINT_KEYS = new Set(["id", "name", "expression"]);

const FORBIDDEN_KEYS = new Set([
  "account",
  "warehouse",
  "role",
  "connection",
  "session",
  "credential",
  "credentials",
  "password",
  "token",
  "canvas",
  "nodes",
  "edges",
  "viewport",
  "theme",
  "selected",
  "selection",
  "history",
  "color",
  "collapsed",
  "x",
  "y",
  "zoom",
]);

const FALLBACK_X_STEP = 280;
const FALLBACK_Y = 80;
const SNOWFLAKE_UNQUOTED_IDENT_RE = /^[A-Z_][A-Z0-9_$]*$/;
const SNOWFLAKE_NUMERIC_LITERAL_RE =
  /^[+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?$/;
const SNOWFLAKE_DEFAULT_KEYWORDS = new Set([
  "CURRENT_DATE",
  "CURRENT_ROLE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "CURRENT_USER",
  "LOCALTIME",
  "LOCALTIMESTAMP",
  "NULL",
]);
const SNOWFLAKE_DEFAULT_FUNCTIONS = new Set([
  "CURRENT_DATE",
  "CURRENT_TIME",
  "CURRENT_TIMESTAMP",
  "DATE",
  "DATEADD",
  "GETDATE",
  "LOCALTIME",
  "LOCALTIMESTAMP",
  "SEQ1",
  "SEQ2",
  "SEQ4",
  "SEQ8",
  "SYSDATE",
  "SYSTIMESTAMP",
  "TO_DATE",
  "TO_TIME",
  "TO_TIMESTAMP",
  "TO_TIMESTAMP_NTZ",
  "TRY_TO_DATE",
  "TRY_TO_TIME",
  "TRY_TO_TIMESTAMP",
  "TRY_TO_TIMESTAMP_NTZ",
  "UUID_STRING",
]);

function fail(message) {
  throw new Error(message);
}

function checkFail(code, message) {
  throw new SnowflakeCheckError(code, message);
}

/**
 * Validate an opaque Snowflake CHECK predicate without attempting to parse or
 * rewrite SQL.  Delimiters/comments are tracked only to prevent a predicate
 * from escaping its CHECK or CREATE TABLE statement; the returned text is
 * otherwise byte-for-byte identical apart from outer whitespace.
 */
export function validateSnowflakeCheckExpression(expression) {
  if (typeof expression !== "string") {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK expression must be a string",
    );
  }
  const text = expression.trim();
  if (!text) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK expression must be nonblank",
    );
  }

  let state = "normal";
  let depth = 0;
  let meaningful = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (state === "line_comment") {
      if (char === "\n" || char === "\r") state = "normal";
      continue;
    }
    if (state === "block_comment") {
      if (char === "*" && next === "/") {
        state = "normal";
        index += 1;
      }
      continue;
    }
    if (state === "single_quote") {
      meaningful = true;
      if (char === "\\" && next !== undefined) {
        index += 1;
      } else if (char === "'" && next === "'") {
        index += 1;
      } else if (char === "'") {
        state = "normal";
      }
      continue;
    }
    if (state === "double_quote") {
      meaningful = true;
      if (char === '"' && next === '"') {
        index += 1;
      } else if (char === '"') {
        state = "normal";
      }
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line_comment";
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      state = "block_comment";
      index += 1;
      continue;
    }
    if (char === "'") {
      state = "single_quote";
      meaningful = true;
      continue;
    }
    if (char === '"') {
      state = "double_quote";
      meaningful = true;
      continue;
    }
    if (char === "`" || char === "[") {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.UNSUPPORTED,
        "CHECK expression uses an unsupported identifier quoting form",
      );
    }
    if (char === "$" && /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.test(text.slice(index))) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.UNSUPPORTED,
        "CHECK expression uses unsupported dollar-quoted syntax",
      );
    }
    if (char === ";") {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.UNSUPPORTED,
        "CHECK expression may not contain a statement separator",
      );
    }
    if (char === "(") {
      depth += 1;
      meaningful = true;
      continue;
    }
    if (char === ")") {
      if (depth === 0) {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
          "CHECK expression has an unmatched closing parenthesis",
        );
      }
      depth -= 1;
      meaningful = true;
      continue;
    }
    if (char < " " && char !== "\t" && char !== "\n" && char !== "\r") {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        "CHECK expression contains a control character",
      );
    }
    if (!/\s/.test(char)) meaningful = true;
  }

  if (state !== "normal" && state !== "line_comment") {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK expression has an unterminated quote or comment",
    );
  }
  if (depth !== 0) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK expression has unbalanced parentheses",
    );
  }
  if (!meaningful) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK expression must contain a predicate",
    );
  }
  return text;
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function requireObject(value, label) {
  if (!isPlainObject(value)) {
    fail(`${label} must be an object`);
  }
  return value;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) {
    fail(`${label} must be an array`);
  }
  return value;
}

function requireNonblankString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must be a nonblank string`);
  }
  return value;
}

function requireOptionalString(value, label) {
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    fail(`${label} must be a string or null`);
  }
  return value;
}

function requireLegalSnowflakeIdentifier(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be a string`);
  }
  if (!value) {
    fail(`${label} must be a nonblank string`);
  }
  if (
    value.length > SNOWFLAKE_IDENTIFIER_MAX_LENGTH ||
    !SNOWFLAKE_UNQUOTED_IDENT_RE.test(value)
  ) {
    fail(`${label} must be a legal uppercase unquoted Snowflake identifier`);
  }
  return value;
}

function requireUniqueIds(ids, label) {
  if (ids.length !== new Set(ids).size) {
    fail(`${label} must have unique ids`);
  }
}

function sqlStringLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function isSingleQuotedSqlLiteral(value) {
  return /^'(?:[^']|'')*'$/.test(value);
}

function isRecognizedSnowflakeDefaultFunction(value) {
  const text = String(value).trim();
  const match = text.match(/^([A-Z_][A-Z0-9_$]*)\s*\(/i);
  if (!match || !SNOWFLAKE_DEFAULT_FUNCTIONS.has(match[1].toUpperCase())) {
    return false;
  }

  let depth = 0;
  let inString = false;
  for (let index = match[0].length - 1; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "'" && text[index + 1] === "'") {
        index += 1;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return index === text.length - 1;
      }
      if (depth < 0) {
        return false;
      }
    }
  }
  return false;
}

export function isSnowflakeDefaultExpression(value) {
  const text = String(value).trim();
  return (
    SNOWFLAKE_DEFAULT_KEYWORDS.has(text.toUpperCase()) ||
    isRecognizedSnowflakeDefaultFunction(text)
  );
}

function snowflakeDefaultLiteral(value) {
  const text = String(value).trim();
  const upper = text.toUpperCase();
  if (
    isSingleQuotedSqlLiteral(text) ||
    SNOWFLAKE_NUMERIC_LITERAL_RE.test(text) ||
    upper === "TRUE" ||
    upper === "FALSE" ||
    isSnowflakeDefaultExpression(text)
  ) {
    return text;
  }
  return sqlStringLiteral(text);
}

function requireBoolean(value, label) {
  if (typeof value !== "boolean") {
    fail(`${label} must be a boolean`);
  }
  return value;
}

function requireInt(value, label) {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(`${label} must be an integer`);
  }
  return value;
}

function requireFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${label} must be a finite number`);
  }
  return value;
}

function requireExactKeys(obj, allowed, label) {
  const keys = Object.keys(obj);
  for (const key of keys) {
    if (!allowed.has(key)) {
      fail(`${label} has unexpected field ${key}`);
    }
  }
  for (const key of allowed) {
    if (!(key in obj)) {
      fail(`${label} is missing required ${key}`);
    }
  }
}

function rejectUnexpectedKeys(obj, allowed, label) {
  requireObject(obj, label);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      fail(`${label} has unexpected field ${key}`);
    }
  }
}

function requireEntityId(value, label) {
  if (
    (typeof value !== "string" || !value.trim()) &&
    (typeof value !== "number" || !Number.isInteger(value))
  ) {
    fail(`${label} must be a nonblank string or integer`);
  }
  return value;
}

function validateOptional(value, validator, label) {
  if (value !== undefined) validator(value, label);
}

function requireStringArray(value, label) {
  return requireArray(value, label).map((item, index) =>
    requireNonblankString(item, `${label}[${index}]`),
  );
}

function requireIdArray(value, label) {
  return requireArray(value, label).map((item, index) =>
    requireEntityId(item, `${label}[${index}]`),
  );
}

function validateDrawdbEntityKeys(document) {
  const tableIds = new Set();
  const fieldIdsByTable = new Map();
  document.tables.forEach((table, tableIndex) => {
    const tableLabel = `drawdb_document.tables[${tableIndex}]`;
    rejectUnexpectedKeys(table, DRAWDB_TABLE_KEYS, tableLabel);
    const tableId = requireEntityId(table.id, `${tableLabel}.id`);
    if (tableIds.has(tableId)) fail(`${tableLabel}.id must be unique`);
    tableIds.add(tableId);
    requireNonblankString(table.name, `${tableLabel}.name`);
    requireFiniteNumber(table.x, `${tableLabel}.x`);
    requireFiniteNumber(table.y, `${tableLabel}.y`);
    validateOptional(
      table.comment,
      requireOptionalString,
      `${tableLabel}.comment`,
    );
    for (const flag of ["locked", "hidden", "collapsed"]) {
      validateOptional(table[flag], requireBoolean, `${tableLabel}.${flag}`);
    }
    validateOptional(table.color, requireNonblankString, `${tableLabel}.color`);
    if (table.inherits !== undefined) {
      requireIdArray(table.inherits, `${tableLabel}.inherits`);
    }
    const fieldIds = new Set();
    requireArray(table.fields, `${tableLabel}.fields`).forEach(
      (field, fieldIndex) => {
        const fieldLabel = `${tableLabel}.fields[${fieldIndex}]`;
        rejectUnexpectedKeys(field, DRAWDB_FIELD_KEYS, fieldLabel);
        const fieldId = requireEntityId(field.id, `${fieldLabel}.id`);
        if (fieldIds.has(fieldId)) fail(`${fieldLabel}.id must be unique`);
        fieldIds.add(fieldId);
        requireNonblankString(field.name, `${fieldLabel}.name`);
        requireNonblankString(field.type, `${fieldLabel}.type`);
        for (const flag of [
          "primary",
          "unique",
          "unsigned",
          "notNull",
          "increment",
          "isArray",
        ]) {
          validateOptional(
            field[flag],
            requireBoolean,
            `${fieldLabel}.${flag}`,
          );
        }
        for (const key of ["check", "comment"]) {
          validateOptional(
            field[key],
            requireOptionalString,
            `${fieldLabel}.${key}`,
          );
        }
        if (field.values !== undefined) {
          requireStringArray(field.values, `${fieldLabel}.values`);
        }
        if (
          field.default !== undefined &&
          field.default !== null &&
          !["string", "number", "boolean"].includes(typeof field.default)
        ) {
          fail(`${fieldLabel}.default must be a scalar or null`);
        }
        if (
          field.size !== undefined &&
          field.size !== null &&
          typeof field.size !== "string" &&
          !Number.isFinite(field.size)
        ) {
          fail(`${fieldLabel}.size must be a string, finite number, or null`);
        }
      },
    );
    fieldIdsByTable.set(tableId, fieldIds);
    requireArray(table.indices ?? [], `${tableLabel}.indices`).forEach(
      (index, indexPosition) => {
        const indexLabel = `${tableLabel}.indices[${indexPosition}]`;
        rejectUnexpectedKeys(index, DRAWDB_INDEX_KEYS, indexLabel);
        validateOptional(index.id, requireEntityId, `${indexLabel}.id`);
        requireNonblankString(index.name, `${indexLabel}.name`);
        requireBoolean(index.unique, `${indexLabel}.unique`);
        requireIdArray(index.fields, `${indexLabel}.fields`);
      },
    );
    requireArray(
      table.uniqueConstraints ?? [],
      `${tableLabel}.uniqueConstraints`,
    ).forEach((constraint, constraintIndex) => {
      const constraintLabel = `${tableLabel}.uniqueConstraints[${constraintIndex}]`;
      rejectUnexpectedKeys(
        constraint,
        DRAWDB_UNIQUE_CONSTRAINT_KEYS,
        constraintLabel,
      );
      validateOptional(constraint.id, requireEntityId, `${constraintLabel}.id`);
      requireNonblankString(constraint.name, `${constraintLabel}.name`);
      requireIdArray(constraint.fields, `${constraintLabel}.fields`);
    });
    if (table.namespace !== undefined) {
      rejectUnexpectedKeys(
        table.namespace,
        DRAWDB_NAMESPACE_KEYS,
        `${tableLabel}.namespace`,
      );
      requireEntityId(table.namespace.id, `${tableLabel}.namespace.id`);
      requireNonblankString(
        table.namespace.catalog,
        `${tableLabel}.namespace.catalog`,
      );
      requireNonblankString(
        table.namespace.schema,
        `${tableLabel}.namespace.schema`,
      );
    }
    if (table.constraintView !== undefined) {
      rejectUnexpectedKeys(
        table.constraintView,
        DRAWDB_CONSTRAINT_VIEW_KEYS,
        `${tableLabel}.constraintView`,
      );
      if (
        table.constraintView.uniqueNames !== undefined &&
        !isPlainObject(table.constraintView.uniqueNames)
      ) {
        fail(`${tableLabel}.constraintView.uniqueNames must be an object`);
      }
      validateOptional(
        table.constraintView.primaryKeyName,
        requireNonblankString,
        `${tableLabel}.constraintView.primaryKeyName`,
      );
      if (table.constraintView.uniqueNames !== undefined) {
        for (const [identifier, name] of Object.entries(
          table.constraintView.uniqueNames,
        )) {
          requireNonblankString(
            identifier,
            `${tableLabel}.constraintView.uniqueNames key`,
          );
          requireNonblankString(
            name,
            `${tableLabel}.constraintView.uniqueNames.${identifier}`,
          );
        }
      }
    }
    const checkIds = new Set();
    requireArray(
      table.checkConstraints ?? [],
      `${tableLabel}.checkConstraints`,
    ).forEach((check, checkIndex) => {
      const checkLabel = `${tableLabel}.checkConstraints[${checkIndex}]`;
      rejectUnexpectedKeys(check, DRAWDB_CHECK_CONSTRAINT_KEYS, checkLabel);
      const checkId = requireEntityId(check.id, `${checkLabel}.id`);
      if (checkIds.has(checkId)) fail(`${checkLabel}.id must be unique`);
      checkIds.add(checkId);
      requireNonblankString(check.name, `${checkLabel}.name`);
      // Validate the opaque expression here so malformed persisted editor
      // state cannot be accepted and later silently omitted by a boundary.
      validateSnowflakeCheckExpression(check.expression);
    });
  });

  document.relationships.forEach((relationship, relationshipIndex) => {
    const relationshipLabel = `drawdb_document.relationships[${relationshipIndex}]`;
    rejectUnexpectedKeys(
      relationship,
      DRAWDB_RELATIONSHIP_KEYS,
      relationshipLabel,
    );
    requireEntityId(relationship.id, `${relationshipLabel}.id`);
    validateOptional(
      relationship.name,
      requireOptionalString,
      `${relationshipLabel}.name`,
    );
    const startTableId = requireEntityId(
      relationship.startTableId,
      `${relationshipLabel}.startTableId`,
    );
    const endTableId = requireEntityId(
      relationship.endTableId,
      `${relationshipLabel}.endTableId`,
    );
    const startFieldId = requireEntityId(
      relationship.startFieldId,
      `${relationshipLabel}.startFieldId`,
    );
    const endFieldId = requireEntityId(
      relationship.endFieldId,
      `${relationshipLabel}.endFieldId`,
    );
    if (!tableIds.has(startTableId) || !tableIds.has(endTableId)) {
      fail(`${relationshipLabel} references an unknown table`);
    }
    if (
      !fieldIdsByTable.get(startTableId)?.has(startFieldId) ||
      !fieldIdsByTable.get(endTableId)?.has(endFieldId)
    ) {
      fail(`${relationshipLabel} references an unknown field`);
    }
    requireNonblankString(
      relationship.cardinality,
      `${relationshipLabel}.cardinality`,
    );
    requireNonblankString(
      relationship.updateConstraint,
      `${relationshipLabel}.updateConstraint`,
    );
    requireNonblankString(
      relationship.deleteConstraint,
      `${relationshipLabel}.deleteConstraint`,
    );
    requireArray(
      relationship.fields ?? [],
      `${relationshipLabel}.fields`,
    ).forEach((field, fieldIndex) => {
      const fieldLabel = `${relationshipLabel}.fields[${fieldIndex}]`;
      rejectUnexpectedKeys(field, DRAWDB_RELATIONSHIP_FIELD_KEYS, fieldLabel);
      requireEntityId(field.startFieldId, `${fieldLabel}.startFieldId`);
      requireEntityId(field.endFieldId, `${fieldLabel}.endFieldId`);
    });
  });

  document.notes.forEach((note, index) => {
    const label = `drawdb_document.notes[${index}]`;
    rejectUnexpectedKeys(note, DRAWDB_NOTE_KEYS, label);
    requireEntityId(note.id, `${label}.id`);
    requireFiniteNumber(note.x, `${label}.x`);
    requireFiniteNumber(note.y, `${label}.y`);
    requireNonblankString(note.title, `${label}.title`);
    if (typeof note.content !== "string")
      fail(`${label}.content must be a string`);
    for (const key of ["height", "width"])
      validateOptional(note[key], requireFiniteNumber, `${label}.${key}`);
    validateOptional(note.color, requireNonblankString, `${label}.color`);
    validateOptional(note.locked, requireBoolean, `${label}.locked`);
  });
  document.areas.forEach((area, index) => {
    const label = `drawdb_document.areas[${index}]`;
    rejectUnexpectedKeys(area, DRAWDB_AREA_KEYS, label);
    requireEntityId(area.id, `${label}.id`);
    requireNonblankString(area.name, `${label}.name`);
    for (const key of ["x", "y", "width", "height"])
      requireFiniteNumber(area[key], `${label}.${key}`);
    validateOptional(area.locked, requireBoolean, `${label}.locked`);
    validateOptional(area.color, requireNonblankString, `${label}.color`);
  });
  document.types.forEach((type, typeIndex) => {
    const typeLabel = `drawdb_document.types[${typeIndex}]`;
    rejectUnexpectedKeys(type, DRAWDB_TYPE_KEYS, typeLabel);
    validateOptional(type.id, requireEntityId, `${typeLabel}.id`);
    requireNonblankString(type.name, `${typeLabel}.name`);
    validateOptional(
      type.comment,
      requireOptionalString,
      `${typeLabel}.comment`,
    );
    requireArray(type.fields, `${typeLabel}.fields`).forEach(
      (field, fieldIndex) => {
        const fieldLabel = `${typeLabel}.fields[${fieldIndex}]`;
        rejectUnexpectedKeys(field, DRAWDB_TYPE_FIELD_KEYS, fieldLabel);
        validateOptional(field.id, requireEntityId, `${fieldLabel}.id`);
        requireNonblankString(field.name, `${fieldLabel}.name`);
        requireNonblankString(field.type, `${fieldLabel}.type`);
        if (field.values !== undefined)
          requireStringArray(field.values, `${fieldLabel}.values`);
      },
    );
  });
  document.enums.forEach((enumValue, index) => {
    const label = `drawdb_document.enums[${index}]`;
    rejectUnexpectedKeys(enumValue, DRAWDB_ENUM_KEYS, label);
    validateOptional(enumValue.id, requireEntityId, `${label}.id`);
    requireNonblankString(enumValue.name, `${label}.name`);
    requireStringArray(enumValue.values, `${label}.values`);
  });
}

function assertNoForbiddenKeys(value, path = "value") {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoForbiddenKeys(item, `${path}[${index}]`),
    );
    return;
  }
  if (!isPlainObject(value)) {
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      fail(`forbidden field ${key} at ${path}`);
    }
    assertNoForbiddenKeys(child, `${path}.${key}`);
  }
}

export function toSnowflakeIdentifier(value, label = "identifier") {
  if (typeof value !== "string") {
    fail(`${label} must be a string`);
  }
  let normalized = "";
  for (const char of value) {
    if (char >= "a" && char <= "z") {
      normalized += char.toUpperCase();
    } else if (
      (char >= "A" && char <= "Z") ||
      (char >= "0" && char <= "9") ||
      char === "_" ||
      char === "$"
    ) {
      normalized += char;
    } else {
      normalized += "_";
    }
  }
  if (normalized && !/^[A-Z_]/.test(normalized)) {
    normalized = `_${normalized}`;
  }
  if (!normalized) {
    fail(
      `${label} normalizes to an empty identifier: ${JSON.stringify(value)}`,
    );
  }
  if (normalized.length > SNOWFLAKE_IDENTIFIER_MAX_LENGTH) {
    fail(
      `${label} exceeds Snowflake's ${SNOWFLAKE_IDENTIFIER_MAX_LENGTH}-character limit`,
    );
  }
  return normalized;
}

function validateDataType(
  dataType,
  label,
  {
    legacy = false,
    allowIncompleteVector = false,
    timestampTypeMapping,
  } = {},
) {
  requireObject(dataType, label);
  if (legacy) {
    const legacyKeys = new Set(Object.keys(dataType));
    for (const key of legacyKeys) {
      if (!LEGACY_DATA_TYPE_KEYS.has(key)) {
        fail(`${label} has unexpected field ${key}`);
      }
    }
    for (const key of LEGACY_DATA_TYPE_KEYS) {
      if (!(key in dataType)) fail(`${label} is missing required ${key}`);
    }
    return canonicalizeSnowflakeType(dataType, {
      allowIncompleteVector,
      timestampTypeMapping,
      label: `${label} legacy`,
    });
  }
  return validateSnowflakeType(dataType, {
    allowIncompleteVector,
    timestampTypeMapping,
    label,
  });
}

function fieldSizeFromDataType(dataType) {
  return fieldSizeFromSnowflakeType(dataType);
}

function dataTypeFromField(field) {
  const label = `field ${field.name}`;
  return canonicalizeSnowflakeTypeFromField(field, {
    allowIncompleteVector: true,
    label,
  });
}

function sortById(items) {
  return [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function namespaceId(catalog, schema) {
  return `namespace:${catalog}.${schema}`;
}

function tableId(catalog, schema, tableName) {
  return `table:${catalog}.${schema}.${tableName}`;
}

function columnId(catalog, schema, tableName, columnName) {
  return `column:${catalog}.${schema}.${tableName}.${columnName}`;
}

function constraintId(catalog, schema, tableName, constraintName) {
  return `constraint:${catalog}.${schema}.${tableName}.${constraintName}`;
}

function relationshipId(catalog, schema, tableName, constraintName) {
  return `relationship:${catalog}.${schema}.${tableName}.${constraintName}`;
}

function fallbackPosition(index) {
  return { x: index * FALLBACK_X_STEP, y: FALLBACK_Y };
}

function parseDiagramLayout(diagramLayout, tableIds) {
  if (diagramLayout === undefined) {
    return {
      nodes: {},
      viewport: { x: 0, y: 0, zoom: 1 },
    };
  }
  requireObject(diagramLayout, "diagram_layout");
  requireExactKeys(diagramLayout, LAYOUT_KEYS, "diagram_layout");
  requireObject(diagramLayout.nodes, "nodes");
  requireObject(diagramLayout.viewport, "viewport");
  requireExactKeys(diagramLayout.viewport, VIEWPORT_KEYS, "viewport");

  const nodes = {};
  for (const [nodeId, position] of Object.entries(diagramLayout.nodes)) {
    if (!tableIds.has(nodeId)) {
      fail(
        `diagram_layout references unknown table id ${JSON.stringify(nodeId)}`,
      );
    }
    requireObject(position, "node");
    requireExactKeys(position, NODE_KEYS, "node");
    nodes[nodeId] = {
      x: requireFiniteNumber(position.x, "x"),
      y: requireFiniteNumber(position.y, "y"),
    };
  }

  const zoom = requireFiniteNumber(diagramLayout.viewport.zoom, "zoom");
  if (zoom <= 0) {
    fail("zoom must be a positive number");
  }

  return {
    nodes,
    viewport: {
      x: requireFiniteNumber(diagramLayout.viewport.x, "x"),
      y: requireFiniteNumber(diagramLayout.viewport.y, "y"),
      zoom,
    },
  };
}

function validateDrawdbDocument(document) {
  requireObject(document, "drawdb_document");
  requireExactKeys(document, DRAWDB_DOCUMENT_KEYS, "drawdb_document");
  const database = requireNonblankString(
    document.database,
    "drawdb_document.database",
  );
  if (!SUPPORTED_DRAWDB_DATABASES.has(database)) {
    fail(
      `drawdb_document.database is unsupported: ${JSON.stringify(database)}`,
    );
  }
  const title = requireNonblankString(document.title, "drawdb_document.title");
  const tables = requireArray(document.tables, "drawdb_document.tables");
  const relationships = requireArray(
    document.relationships,
    "drawdb_document.relationships",
  );
  const notes = requireArray(document.notes, "drawdb_document.notes");
  const areas = requireArray(document.areas, "drawdb_document.areas");
  const types = requireArray(document.types, "drawdb_document.types");
  const enums = requireArray(document.enums, "drawdb_document.enums");
  validateDrawdbEntityKeys(document);
  requireObject(document.transform, "drawdb_document.transform");
  requireExactKeys(
    document.transform,
    new Set(["pan", "zoom"]),
    "drawdb_document.transform",
  );
  requireObject(document.transform.pan, "drawdb_document.transform.pan");
  requireExactKeys(
    document.transform.pan,
    new Set(["x", "y"]),
    "drawdb_document.transform.pan",
  );
  const transform = {
    pan: {
      x: requireFiniteNumber(
        document.transform.pan.x,
        "drawdb_document.transform.pan.x",
      ),
      y: requireFiniteNumber(
        document.transform.pan.y,
        "drawdb_document.transform.pan.y",
      ),
    },
    zoom: requireFiniteNumber(
      document.transform.zoom,
      "drawdb_document.transform.zoom",
    ),
  };
  if (transform.zoom <= 0)
    fail("drawdb_document.transform.zoom must be positive");

  const assertNoSensitiveKeys = (value, path = "drawdb_document") => {
    if (Array.isArray(value)) {
      value.forEach((item, index) =>
        assertNoSensitiveKeys(item, `${path}[${index}]`),
      );
      return;
    }
    if (!isPlainObject(value)) return;
    const identifierMap = path.endsWith(".constraintView.uniqueNames");
    for (const [key, child] of Object.entries(value)) {
      if (!identifierMap && SENSITIVE_PROJECT_KEY.test(key)) {
        fail(`credential-like field ${key} is not allowed at ${path}`);
      }
      assertNoSensitiveKeys(child, `${path}.${key}`);
    }
  };
  assertNoSensitiveKeys(document);

  // Clone the allowlisted editor DTO so the native project owns plain JSON data
  // and cannot retain renderer object references.
  return JSON.parse(
    JSON.stringify({
      database,
      title,
      tables,
      relationships,
      notes,
      areas,
      types,
      enums,
      transform,
    }),
  );
}

function reconcileCanonicalTypesIntoDrawdbDocument(document, model) {
  if (document.database !== "snowflake") {
    if (
      model.tables.some((table) =>
        table.constraints.some((constraint) => constraint.kind === "check"),
      )
    ) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.LOSS,
        `drawdb_document database ${document.database} cannot represent Snowflake CHECK constraints`,
      );
    }
    return document;
  }
  if (document.tables.length !== model.tables.length) {
    fail("drawdb_document tables are inconsistent with physical_model");
  }
  const namespaceById = new Map(model.namespaces.map((ns) => [ns.id, ns]));
  const tableById = new Map(model.tables.map((table) => [table.id, table]));
  const seenTableIds = new Set();

  return {
    ...document,
    tables: document.tables.map((table) => {
      const namespace = isPlainObject(table.namespace)
        ? {
            catalog: toSnowflakeIdentifier(table.namespace.catalog, "catalog"),
            schema: toSnowflakeIdentifier(table.namespace.schema, "schema"),
          }
        : { catalog: "MODEL", schema: "PUBLIC" };
      const canonicalTableId = tableId(
        namespace.catalog,
        namespace.schema,
        toSnowflakeIdentifier(table.name, "table"),
      );
      const canonicalTable = tableById.get(canonicalTableId);
      if (!canonicalTable) {
        fail(
          `drawdb_document table ${JSON.stringify(table.name)} is inconsistent with physical_model`,
        );
      }
      if (seenTableIds.has(canonicalTableId)) {
        fail("drawdb_document table mapping is not unique");
      }
      seenTableIds.add(canonicalTableId);
      const canonicalNamespace = namespaceById.get(
        canonicalTable.namespace_id,
      );
      if (
        !canonicalNamespace ||
        canonicalNamespace.catalog !== namespace.catalog ||
        canonicalNamespace.schema !== namespace.schema
      ) {
        fail(
          `drawdb_document namespace for ${JSON.stringify(table.name)} is inconsistent with physical_model`,
        );
      }
      const columnById = new Map(
        canonicalTable.columns.map((column) => [column.id, column]),
      );
      const canonicalChecks = canonicalTable.constraints
        .filter((constraint) => constraint.kind === "check")
        .map((constraint) => ({
          id: constraint.id,
          name: constraint.name,
          expression: constraint.expression,
        }));
      const canonicalByName = new Map(
        canonicalChecks.map((check) => [check.name, check]),
      );
      const rawChecks = table.checkConstraints ?? [];
      for (const rawCheck of rawChecks) {
        let rawName;
        try {
          rawName = toSnowflakeIdentifier(rawCheck.name, "check");
        } catch (error) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.LOSS,
            `drawdb_document CHECK name cannot be reconciled for ${table.name}: ${error.message}`,
          );
        }
        const rawExpression = validateSnowflakeCheckExpression(
          rawCheck.expression,
        );
        const canonicalCheck = canonicalByName.get(rawName);
        if (!canonicalCheck) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.LOSS,
            `drawdb_document contains raw-only CHECK ${rawName} that is absent from physical_model`,
          );
        }
        if (canonicalCheck.expression !== rawExpression) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.LOSS,
            `drawdb_document CHECK ${rawName} conflicts with physical_model`,
          );
        }
      }
      for (const field of table.fields) {
        if (
          field.check === undefined ||
          field.check === null ||
          (typeof field.check === "string" && !field.check.trim())
        ) {
          continue;
        }
        const expression = validateSnowflakeCheckExpression(field.check);
        if (!canonicalChecks.some((check) => check.expression === expression)) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.LOSS,
            `drawdb_document legacy field CHECK on ${table.name}.${field.name} is absent from physical_model`,
          );
        }
      }
      if (table.fields.length !== canonicalTable.columns.length) {
        fail(
          `drawdb_document columns for ${JSON.stringify(table.name)} are inconsistent with physical_model`,
        );
      }
      const seenColumnIds = new Set();
      return {
        ...table,
        checkConstraints: canonicalChecks,
        fields: table.fields.map((field) => {
          const canonicalColumnId = columnId(
            namespace.catalog,
            namespace.schema,
            canonicalTable.name,
            toSnowflakeIdentifier(field.name, "column"),
          );
          const canonicalColumn = columnById.get(canonicalColumnId);
          if (!canonicalColumn) {
            fail(
              `drawdb_document column ${JSON.stringify(field.name)} is inconsistent with physical_model`,
            );
          }
          if (seenColumnIds.has(canonicalColumnId)) {
            fail("drawdb_document column mapping is not unique");
          }
          seenColumnIds.add(canonicalColumnId);
          const reconciled = {
            ...field,
            type: canonicalColumn.data_type.family,
          };
          if (
            reconciled.check !== undefined &&
            reconciled.check !== null &&
            String(reconciled.check).trim()
          ) {
            // CHECK now has a first-class table representation.  Clear the
            // legacy editor transport after proving its predicate was already
            // represented by the canonical model above.
            reconciled.check = "";
          }
          const size = fieldSizeFromDataType(canonicalColumn.data_type);
          if (size === undefined) delete reconciled.size;
          else reconciled.size = size;
          return reconciled;
        }),
      };
    }),
  };
}

function checkTableLabel(table) {
  const rawName = table?.name;
  if (typeof rawName !== "string" || !rawName.trim()) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK-bearing table must have a nonblank name",
    );
  }
  return toSnowflakeIdentifier(rawName, "table");
}

function fallbackCheckId(table, name) {
  const tableIdValue = table?.id;
  if (typeof tableIdValue === "string" && tableIdValue.startsWith("table:")) {
    return `constraint:${tableIdValue.slice("table:".length)}.${name}`;
  }
  return `check:${String(tableIdValue ?? table?.name ?? "TABLE")}.${name}`;
}

function boundedGeneratedCheckName(base, seen) {
  let normalizedBase;
  try {
    normalizedBase = toSnowflakeIdentifier(base, "check");
  } catch (error) {
    if (!/exceeds Snowflake's/i.test(error.message)) throw error;
    normalizedBase = String(base)
      .split("")
      .map((char) => {
        if (char >= "a" && char <= "z") return char.toUpperCase();
        return /[A-Z0-9_$]/.test(char) ? char : "_";
      })
      .join("");
    if (!/^[A-Z_]/.test(normalizedBase)) normalizedBase = `_${normalizedBase}`;
  }
  const makeCandidate = (suffix) => {
    const suffixText = suffix === 1 ? "" : `_${suffix}`;
    const room = SNOWFLAKE_IDENTIFIER_MAX_LENGTH - suffixText.length;
    const prefix = normalizedBase.slice(0, Math.max(1, room));
    return `${prefix}${suffixText}`;
  };
  let suffix = 1;
  let candidate = makeCandidate(suffix);
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = makeCandidate(suffix);
  }
  seen.add(candidate);
  return candidate;
}

/**
 * Return the validated CHECK view shared by diagram/editor and logical
 * boundaries.  Canonical constraints, explicit diagram checks, and legacy
 * `field.check` values are combined without mutating the source table.
 */
export function getSnowflakeTableChecks(table, options = {}) {
  if (!isPlainObject(table)) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "CHECK-bearing table must be an object",
    );
  }
  if (
    table.checkConstraints !== undefined &&
    !Array.isArray(table.checkConstraints)
  ) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      "checkConstraints must be an array",
    );
  }
  const hasCanonicalCheck = Array.isArray(table.constraints)
    ? table.constraints.some(
        (constraint) =>
          isPlainObject(constraint) &&
          String(constraint.kind ?? "").toLowerCase() === "check",
      )
    : false;
  const hasLegacyCheck = Array.isArray(table.fields)
    ? table.fields.some(
        (field) =>
          isPlainObject(field) &&
          field.check !== undefined &&
          field.check !== null &&
          String(field.check).trim(),
      )
    : false;
  if (!(table.checkConstraints?.length || hasCanonicalCheck || hasLegacyCheck)) {
    return [];
  }
  const tableName = checkTableLabel(table);
  const names = new Set();
  const checks = [];
  const addReserved = (value) => {
    if (typeof value !== "string" || !value.trim()) return;
    try {
      names.add(toSnowflakeIdentifier(value, "constraint"));
    } catch (error) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `invalid constraint name on ${tableName}: ${error.message}`,
      );
    }
  };

  for (const value of options.reservedNames ?? []) addReserved(value);
  for (const constraint of Array.isArray(table.constraints)
    ? table.constraints
    : []) {
    if (!isPlainObject(constraint)) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `constraint on ${tableName} must be an object`,
      );
    }
    if (String(constraint.kind ?? "").toLowerCase() !== "check") {
      addReserved(constraint.name);
    }
  }
  const constraintView = isPlainObject(table.constraintView)
    ? table.constraintView
    : {};
  addReserved(constraintView.primaryKeyName);
  for (const value of Object.values(constraintView.uniqueNames ?? {})) {
    addReserved(value);
  }
  for (const value of Array.isArray(table.uniqueConstraints)
    ? table.uniqueConstraints
    : []) {
    if (isPlainObject(value)) addReserved(value.name);
  }

  const addCheck = ({ id, name, expression, generated = false }) => {
    if (typeof name !== "string" || !name.trim()) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK name on ${tableName} must be nonblank`,
      );
    }
    let normalizedName;
    try {
      normalizedName = toSnowflakeIdentifier(name, "check");
    } catch (error) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `invalid CHECK name on ${tableName}: ${error.message}`,
      );
    }
    const normalizedExpression = validateSnowflakeCheckExpression(expression);
    const existing = checks.find((check) => check.name === normalizedName);
    if (existing) {
      if (existing.expression === normalizedExpression) return existing;
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK name collision on ${tableName}: ${normalizedName}`,
      );
    }
    if (names.has(normalizedName) && !generated) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK name collides with another constraint on ${tableName}: ${normalizedName}`,
      );
    }
    names.add(normalizedName);
    const check = {
      id:
        id === undefined || id === null
          ? fallbackCheckId(table, normalizedName)
          : id,
      name: normalizedName,
      expression: normalizedExpression,
    };
    checks.push(check);
    return check;
  };

  // Canonical CHECK constraints are authoritative when both representations
  // are present.  The explicit diagram list is still read to support old or
  // editor-created tables before they cross the canonical boundary.
  const canonicalIds = new Set();
  for (const constraint of Array.isArray(table.constraints)
    ? table.constraints
    : []) {
    if (!isPlainObject(constraint)) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `canonical CHECK on ${tableName} must be an object`,
      );
    }
    if (String(constraint.kind ?? "").toLowerCase() !== "check") continue;
    try {
      requireEntityId(constraint.id, `CHECK id on ${tableName}`);
    } catch (error) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `invalid canonical CHECK on ${tableName}: ${error.message}`,
      );
    }
    if (canonicalIds.has(constraint.id)) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `duplicate canonical CHECK id on ${tableName}: ${constraint.id}`,
      );
    }
    canonicalIds.add(constraint.id);
    if (!Array.isArray(constraint.columns) || constraint.columns.length !== 0) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK ${constraint.name ?? "<unnamed>"} must have no columns`,
      );
    }
    if (
      constraint.referenced_table_id !== null &&
      constraint.referenced_table_id !== undefined
    ) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK ${constraint.name ?? "<unnamed>"} must not reference a table`,
      );
    }
    if (
      constraint.referenced_columns !== undefined &&
      (!Array.isArray(constraint.referenced_columns) ||
        constraint.referenced_columns.length !== 0)
    ) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK ${constraint.name ?? "<unnamed>"} must not reference columns`,
      );
    }
    let normalizedCanonicalName;
    try {
      normalizedCanonicalName = toSnowflakeIdentifier(constraint.name, "check");
    } catch (error) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `invalid canonical CHECK name on ${tableName}: ${error.message}`,
      );
    }
    const existingCanonical = checks.find(
      (check) => check.name === normalizedCanonicalName,
    );
    if (existingCanonical) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `duplicate canonical CHECK name on ${tableName}: ${existingCanonical.name}`,
      );
    }
    addCheck({
      id: constraint.id,
      name: constraint.name,
      expression: constraint.expression,
    });
  }

  if (table.checkConstraints !== undefined) {
    if (!Array.isArray(table.checkConstraints)) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `checkConstraints on ${tableName} must be an array`,
      );
    }
    const explicitNames = new Set();
    const explicitIds = new Set();
    for (const check of table.checkConstraints) {
      if (!isPlainObject(check)) {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
          `checkConstraints on ${tableName} must contain objects`,
        );
      }
      const keys = Object.keys(check).sort();
      if (keys.join(",") !== "expression,id,name") {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
          `checkConstraints on ${tableName} must contain id, name, and expression`,
        );
      }
      let normalizedName;
      try {
        normalizedName = toSnowflakeIdentifier(check.name, "check");
        requireEntityId(check.id, `CHECK id on ${tableName}`);
      } catch (error) {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
          `invalid diagram CHECK on ${tableName}: ${error.message}`,
        );
      }
      if (explicitIds.has(check.id)) {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
          `duplicate diagram CHECK id on ${tableName}: ${check.id}`,
        );
      }
      explicitIds.add(check.id);
      if (explicitNames.has(normalizedName)) {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
          `duplicate diagram CHECK name on ${tableName}: ${normalizedName}`,
        );
      }
      explicitNames.add(normalizedName);
      const normalizedExpression = validateSnowflakeCheckExpression(
        check.expression,
      );
      const canonicalMatch = checks.find(
        (candidate) =>
          candidate.name === normalizedName &&
          candidate.expression === normalizedExpression,
      );
      if (!canonicalMatch) addCheck(check);
    }
  }

  let legacyOrdinal = 0;
  for (const field of Array.isArray(table.fields) ? table.fields : []) {
    if (!isPlainObject(field)) continue;
    if (
      field.check === undefined ||
      field.check === null ||
      (typeof field.check === "string" && !field.check.trim())
    ) {
      continue;
    }
    legacyOrdinal += 1;
    const expression = validateSnowflakeCheckExpression(field.check);
    // A v1 migration may leave the legacy field value in place alongside its
    // canonical table CHECK.  Matching predicates are one semantic check, not
    // two constraints.
    if (checks.some((check) => check.expression === expression)) continue;
    const base = `CK_${tableName}_${legacyOrdinal}`;
    const name = boundedGeneratedCheckName(base, names);
    addCheck({
      id: fallbackCheckId(table, name),
      name,
      expression,
      generated: true,
    });
  }
  return checks;
}

function migrateLegacySnowflakeChecksIntoDiagram(document) {
  if (document.database !== "snowflake") return document;
  return {
    ...document,
    tables: document.tables.map((table) => {
      const checks = getSnowflakeTableChecks(table);
      return {
        ...table,
        checkConstraints: checks,
        fields: table.fields.map((field) => {
          if (
            field.check === undefined ||
            field.check === null ||
            !String(field.check).trim()
          ) {
            return field;
          }
          return { ...field, check: "" };
        }),
      };
    }),
  };
}

function validatePhysicalModel(
  model,
  { allowIncompleteVector = false, timestampTypeMapping } = {},
) {
  requireObject(model, "physical_model");
  requireExactKeys(model, PHYSICAL_MODEL_KEYS, "physical model");
  assertNoForbiddenKeys(model, "physical_model");

  const modelVersion = requireNonblankString(
    model.model_version,
    "model_version",
  );
  if (modelVersion !== MODEL_VERSION && modelVersion !== LEGACY_MODEL_VERSION) {
    fail(
      `Unsupported model_version ${JSON.stringify(modelVersion)}; expected "1" or "2"`,
    );
  }
  const name = requireNonblankString(model.name, "name");
  const namespaces = requireArray(model.namespaces, "namespaces").map(
    (ns, index) => {
      requireObject(ns, `namespaces[${index}]`);
      requireExactKeys(ns, NAMESPACE_KEYS, "namespace");
      return {
        id: requireNonblankString(ns.id, "id"),
        catalog: requireLegalSnowflakeIdentifier(ns.catalog, "catalog"),
        schema: requireLegalSnowflakeIdentifier(ns.schema, "schema"),
      };
    },
  );
  const sortedNamespaces = sortById(namespaces);
  if (sortedNamespaces.some((ns, i) => ns.id !== namespaces[i].id)) {
    fail("namespaces must be sorted by id");
  }
  const namespaceIds = new Set();
  for (const namespace of namespaces) {
    if (namespaceIds.has(namespace.id)) {
      fail("namespaces must have unique ids");
    }
    namespaceIds.add(namespace.id);
    const expectedNsId = namespaceId(namespace.catalog, namespace.schema);
    if (namespace.id !== expectedNsId) {
      fail(`namespace id must equal ${JSON.stringify(expectedNsId)}`);
    }
  }
  const namespaceById = new Map(namespaces.map((ns) => [ns.id, ns]));

  const tables = requireArray(model.tables, "tables").map((table, index) => {
    requireObject(table, `tables[${index}]`);
    requireExactKeys(table, TABLE_KEYS, "table");
    const columns = requireArray(table.columns, "columns").map(
      (column, colIndex) => {
        requireObject(column, `columns[${colIndex}]`);
        requireExactKeys(column, COLUMN_KEYS, "column");
        return {
          id: requireNonblankString(column.id, "id"),
          name: requireLegalSnowflakeIdentifier(column.name, "name"),
          ordinal: requireInt(column.ordinal, "ordinal"),
          data_type: validateDataType(column.data_type, "data_type", {
            legacy: modelVersion === LEGACY_MODEL_VERSION,
            allowIncompleteVector,
            timestampTypeMapping,
          }),
          nullable: requireBoolean(column.nullable, "nullable"),
          default: requireOptionalString(column.default, "default"),
          comment: requireOptionalString(column.comment, "comment"),
        };
      },
    );
    if (columns.length === 0) {
      fail("columns must be a non-empty list");
    }
    columns.forEach((column, colIndex) => {
      if (column.ordinal !== colIndex + 1) {
        fail("ordinal must be one-based and contiguous in column order");
      }
    });
    const columnIds = columns.map((column) => column.id);
    if (columnIds.length !== new Set(columnIds).size) {
      fail("columns must have unique ids");
    }

    const constraints = requireArray(table.constraints, "constraints").map(
      (constraint, cIndex) => {
        requireObject(constraint, `constraints[${cIndex}]`);
        const legacyConstraintKeys = new Set(
          [...CONSTRAINT_KEYS].filter((key) => key !== "expression"),
        );
        for (const key of Object.keys(constraint)) {
          if (!CONSTRAINT_KEYS.has(key)) {
            fail(`constraint has unexpected field ${key}`);
          }
        }
        for (const key of legacyConstraintKeys) {
          if (!(key in constraint)) fail(`constraint is missing required ${key}`);
        }
        const kind = requireNonblankString(constraint.kind, "kind");
        const isCheck = kind === "check";
        if (isCheck && !("expression" in constraint)) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
            `CHECK constraint ${constraint.name ?? "<unnamed>"} is missing expression`,
          );
        }
        if (!isCheck && "expression" in constraint && constraint.expression !== null) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
            `non-CHECK constraint ${constraint.name ?? "<unnamed>"} must have expression:null`,
          );
        }
        const constraintColumns = requireArray(
          constraint.columns,
          "columns",
        ).map((id) => requireNonblankString(id, "constraint column id"));
        if (!isCheck && constraintColumns.length === 0) {
          fail("columns must be a non-empty list");
        }
        requireUniqueIds(constraintColumns, "columns");
        const referencedColumns = requireArray(
          constraint.referenced_columns,
          "referenced_columns",
        ).map((id) => requireNonblankString(id, "referenced column id"));
        requireUniqueIds(referencedColumns, "referenced_columns");
        return {
          id: requireNonblankString(constraint.id, "id"),
          name: requireLegalSnowflakeIdentifier(constraint.name, "name"),
          kind,
          columns: constraintColumns,
          referenced_table_id:
            constraint.referenced_table_id === null
              ? null
              : requireNonblankString(
                  constraint.referenced_table_id,
                  "referenced_table_id",
                ),
          referenced_columns: referencedColumns,
          expression: isCheck
            ? validateSnowflakeCheckExpression(constraint.expression)
            : null,
        };
      },
    );
    const sortedConstraints = sortById(constraints);
    if (sortedConstraints.some((c, i) => c.id !== constraints[i].id)) {
      fail("constraints must be sorted by id");
    }
    const constraintIds = constraints.map((constraint) => constraint.id);
    requireUniqueIds(constraintIds, "constraints");
    const primaryKeyCount = constraints.filter(
      (c) => c.kind === "primary_key",
    ).length;
    if (primaryKeyCount > 1) {
      fail("table may have at most one primary_key constraint");
    }

    return {
      id: requireNonblankString(table.id, "id"),
      namespace_id: requireNonblankString(table.namespace_id, "namespace_id"),
      name: requireLegalSnowflakeIdentifier(table.name, "name"),
      kind: requireNonblankString(table.kind, "kind"),
      columns,
      constraints,
      comment: requireOptionalString(table.comment, "comment"),
    };
  });

  if (tables.length > 0 && namespaces.length === 0) {
    fail("nonempty tables require one or more namespaces");
  }

  const sortedTables = sortById(tables);
  if (sortedTables.some((t, i) => t.id !== tables[i].id)) {
    fail("tables must be sorted by id");
  }
  const tableIds = new Set();
  for (const table of tables) {
    if (tableIds.has(table.id)) {
      fail("tables must have unique ids");
    }
    tableIds.add(table.id);
  }
  const columnsByTable = new Map(
    tables.map((t) => [t.id, new Set(t.columns.map((c) => c.id))]),
  );

  for (const table of tables) {
    const namespace = namespaceById.get(table.namespace_id);
    if (!namespace) {
      fail(`unresolved namespace_id ${JSON.stringify(table.namespace_id)}`);
    }
    if (table.kind !== "table") {
      fail(`unsupported table kind ${table.kind}`);
    }
    const expectedTableId = tableId(
      namespace.catalog,
      namespace.schema,
      table.name,
    );
    if (table.id !== expectedTableId) {
      fail(`id must equal ${JSON.stringify(expectedTableId)}`);
    }
    for (const column of table.columns) {
      const expected = columnId(
        namespace.catalog,
        namespace.schema,
        table.name,
        column.name,
      );
      if (column.id !== expected) {
        fail(`id must equal ${JSON.stringify(expected)}`);
      }
    }
    for (const constraint of table.constraints) {
      const expected = constraintId(
        namespace.catalog,
        namespace.schema,
        table.name,
        constraint.name,
      );
      if (constraint.id !== expected) {
        fail(`id must equal ${JSON.stringify(expected)}`);
      }
      for (const col of constraint.columns) {
        if (!columnsByTable.get(table.id).has(col)) {
          fail(`unresolved column id ${JSON.stringify(col)}`);
        }
      }
      if (constraint.kind === "foreign_key") {
        if (
          !constraint.referenced_table_id ||
          !tableIds.has(constraint.referenced_table_id)
        ) {
          fail(
            `unresolved referenced table id ${JSON.stringify(constraint.referenced_table_id)}`,
          );
        }
        if (constraint.referenced_columns.length === 0) {
          fail("referenced_columns is required for foreign_key");
        }
        if (
          constraint.referenced_columns.length !== constraint.columns.length
        ) {
          fail("referenced_columns must match columns length for foreign_key");
        }
        const refCols = columnsByTable.get(constraint.referenced_table_id);
        for (const col of constraint.referenced_columns) {
          if (!refCols.has(col)) {
            fail(`unresolved referenced column id ${JSON.stringify(col)}`);
          }
        }
      } else if (
        constraint.kind === "primary_key" ||
        constraint.kind === "unique"
      ) {
        if (constraint.referenced_table_id !== null) {
          fail("referenced_table_id must be null for non-FK constraints");
        }
        if (constraint.referenced_columns.length !== 0) {
          fail("referenced_columns must be empty for non-FK constraints");
        }
      } else if (constraint.kind === "check") {
        if (constraint.columns.length !== 0) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
            `CHECK ${constraint.name} must have empty columns`,
          );
        }
        if (constraint.referenced_table_id !== null) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
            `CHECK ${constraint.name} must have referenced_table_id:null`,
          );
        }
        if (constraint.referenced_columns.length !== 0) {
          checkFail(
            SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
            `CHECK ${constraint.name} must have empty referenced_columns`,
          );
        }
      } else {
        fail(`unsupported constraint kind ${constraint.kind}`);
      }
    }
  }

  const relationships = requireArray(model.relationships, "relationships").map(
    (rel, index) => {
      requireObject(rel, `relationships[${index}]`);
      requireExactKeys(rel, RELATIONSHIP_KEYS, "relationship");
      const sourceColumnIds = requireArray(
        rel.source_column_ids,
        "source_column_ids",
      ).map((id) => requireNonblankString(id, "source column id"));
      const targetColumnIds = requireArray(
        rel.target_column_ids,
        "target_column_ids",
      ).map((id) => requireNonblankString(id, "target column id"));
      if (sourceColumnIds.length === 0) {
        fail("source_column_ids must be a non-empty list");
      }
      if (targetColumnIds.length === 0) {
        fail("target_column_ids must be a non-empty list");
      }
      if (sourceColumnIds.length !== targetColumnIds.length) {
        fail("source_column_ids and target_column_ids length must match");
      }
      return {
        id: requireNonblankString(rel.id, "id"),
        name: requireNonblankString(rel.name, "name"),
        source_table_id: requireNonblankString(
          rel.source_table_id,
          "source_table_id",
        ),
        source_column_ids: sourceColumnIds,
        target_table_id: requireNonblankString(
          rel.target_table_id,
          "target_table_id",
        ),
        target_column_ids: targetColumnIds,
        cardinality: requireNonblankString(rel.cardinality, "cardinality"),
      };
    },
  );
  const sortedRelationships = sortById(relationships);
  if (sortedRelationships.some((r, i) => r.id !== relationships[i].id)) {
    fail("relationships must be sorted by id");
  }
  const relationshipIds = relationships.map((rel) => rel.id);
  if (relationshipIds.length !== new Set(relationshipIds).size) {
    fail("relationships must have unique ids");
  }

  for (const rel of relationships) {
    if (!tableIds.has(rel.source_table_id)) {
      fail(`unresolved source_table_id ${JSON.stringify(rel.source_table_id)}`);
    }
    if (!tableIds.has(rel.target_table_id)) {
      fail(`unresolved target_table_id ${JSON.stringify(rel.target_table_id)}`);
    }
    if (rel.cardinality !== "many_to_one") {
      fail(`unsupported cardinality ${rel.cardinality}`);
    }
    const sourceCols = columnsByTable.get(rel.source_table_id);
    const targetCols = columnsByTable.get(rel.target_table_id);
    for (const col of rel.source_column_ids) {
      if (!sourceCols.has(col)) {
        fail(`unresolved source column id ${JSON.stringify(col)}`);
      }
    }
    for (const col of rel.target_column_ids) {
      if (!targetCols.has(col)) {
        fail(`unresolved target column id ${JSON.stringify(col)}`);
      }
    }
  }

  const expectedRelationships = [];
  for (const table of tables) {
    const namespace = namespaceById.get(table.namespace_id);
    for (const constraint of table.constraints) {
      if (constraint.kind !== "foreign_key") continue;
      expectedRelationships.push({
        id: relationshipId(
          namespace.catalog,
          namespace.schema,
          table.name,
          constraint.name,
        ),
        name: constraint.name,
        source_table_id: table.id,
        source_column_ids: constraint.columns,
        target_table_id: constraint.referenced_table_id,
        target_column_ids: constraint.referenced_columns,
        cardinality: "many_to_one",
      });
    }
  }
  const sortedExpected = sortById(expectedRelationships);
  if (JSON.stringify(relationships) !== JSON.stringify(sortedExpected)) {
    fail("relationships are inconsistent with foreign key constraints");
  }

  return {
    model_version: MODEL_VERSION,
    name,
    namespaces,
    tables,
    relationships,
  };
}

export function canonicalProjectToDiagram(project, options = {}) {
  requireObject(project, "project");
  const unexpected = Object.keys(project).filter(
    (key) => !TOP_LEVEL_ALLOWED.has(key),
  );
  if (unexpected.length) {
    fail(`project has unexpected field ${unexpected.sort().join(", ")}`);
  }
  for (const key of unexpected) {
    if (FORBIDDEN_KEYS.has(key)) {
      fail(`forbidden field ${key}`);
    }
  }
  if (!("project_version" in project) || !("physical_model" in project)) {
    fail("project is missing required project_version or physical_model");
  }
  if (
    project.project_version !== PROJECT_VERSION &&
    project.project_version !== LEGACY_PROJECT_VERSION
  ) {
    fail(
      `Unsupported project_version ${JSON.stringify(project.project_version)}; expected "1" or "2"`,
    );
  }

  const model = validatePhysicalModel(project.physical_model, {
    allowIncompleteVector: true,
    timestampTypeMapping: options.timestampTypeMapping,
  });
  const tableIds = new Set(model.tables.map((t) => t.id));
  const layout = parseDiagramLayout(project.diagram_layout, tableIds);
  const drawdbDocument =
    project.drawdb_document === undefined
      ? null
      : validateDrawdbDocument(project.drawdb_document);
  if (
    drawdbDocument &&
    drawdbDocument.database !== "snowflake" &&
    model.tables.some((table) =>
      table.constraints.some((constraint) => constraint.kind === "check"),
    )
  ) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.LOSS,
      `drawdb_document database ${drawdbDocument.database} cannot represent Snowflake CHECK constraints`,
    );
  }
  if (drawdbDocument && project.project_version === LEGACY_PROJECT_VERSION) {
    if (model.tables.some((table) => table.constraints.some((constraint) => constraint.kind === "check"))) {
      return reconcileCanonicalTypesIntoDrawdbDocument(drawdbDocument, model);
    }
    return migrateLegacySnowflakeChecksIntoDiagram(drawdbDocument);
  }
  const namespaceById = new Map(model.namespaces.map((ns) => [ns.id, ns]));

  const tables = model.tables.map((table, index) => {
    const namespace = namespaceById.get(table.namespace_id);
    if (!namespace) {
      fail(`unresolved namespace_id ${JSON.stringify(table.namespace_id)}`);
    }
    const pkColumns = new Set();
    const uniqueSingleColumns = new Set();
    const uniqueConstraints = [];
    const checkConstraints = table.constraints
      .filter((constraint) => constraint.kind === "check")
      .map((constraint) => ({
        id: constraint.id,
        name: constraint.name,
        expression: constraint.expression,
      }));
    let primaryKeyName = null;
    const uniqueNames = {};

    for (const constraint of table.constraints) {
      if (constraint.kind === "primary_key") {
        primaryKeyName = constraint.name;
        constraint.columns.forEach((id) => pkColumns.add(id));
      } else if (constraint.kind === "unique") {
        if (constraint.columns.length === 1) {
          uniqueSingleColumns.add(constraint.columns[0]);
          uniqueNames[constraint.columns[0]] = constraint.name;
        } else {
          const fieldNames = constraint.columns.map((colId) => {
            const column = table.columns.find((c) => c.id === colId);
            return column.name;
          });
          uniqueConstraints.push({
            id: uniqueConstraints.length,
            name: constraint.name,
            fields: fieldNames,
          });
        }
      }
    }

    const position = layout.nodes[table.id] || fallbackPosition(index);
    const constraintView = {};
    if (primaryKeyName) {
      constraintView.primaryKeyName = primaryKeyName;
    }
    if (Object.keys(uniqueNames).length > 0) {
      constraintView.uniqueNames = uniqueNames;
    }

    return {
      id: table.id,
      name: table.name,
      x: position.x,
      y: position.y,
      locked: false,
      comment: table.comment || "",
      indices: [],
      uniqueConstraints,
      checkConstraints,
      color: "#175e7a",
      collapsed: false,
      ...(Object.keys(constraintView).length > 0 ? { constraintView } : {}),
      namespace: {
        id: namespace.id,
        catalog: namespace.catalog,
        schema: namespace.schema,
      },
      fields: table.columns.map((column) => {
        const size = fieldSizeFromDataType(column.data_type);
        const field = {
          id: column.id,
          name: column.name,
          type: column.data_type.family,
          default: column.default ?? "",
          check: "",
          primary: pkColumns.has(column.id),
          unique: uniqueSingleColumns.has(column.id),
          notNull: !column.nullable,
          increment: false,
          comment: column.comment || "",
        };
        if (size !== undefined) {
          field.size = size;
        }
        return field;
      }),
    };
  });

  const relationships = model.relationships.map((rel) => {
    const fields = rel.source_column_ids.map((sourceId, index) => ({
      startFieldId: sourceId,
      endFieldId: rel.target_column_ids[index],
    }));
    return {
      id: rel.id,
      name: rel.name,
      startTableId: rel.source_table_id,
      endTableId: rel.target_table_id,
      startFieldId: fields[0].startFieldId,
      endFieldId: fields[0].endFieldId,
      fields,
      cardinality: "many_to_one",
      updateConstraint: "No action",
      deleteConstraint: "No action",
    };
  });

  const canonicalDiagram = {
    title: model.name,
    tables,
    relationships,
    transform: {
      pan: { x: layout.viewport.x, y: layout.viewport.y },
      zoom: layout.viewport.zoom,
    },
  };
  return drawdbDocument
    ? reconcileCanonicalTypesIntoDrawdbDocument(drawdbDocument, model)
    : canonicalDiagram;
}

function claimUniqueName(seen, value, label) {
  if (seen.has(value)) {
    fail(`${label} collision after normalization: ${value}`);
  }
  seen.add(value);
  return value;
}

export function diagramToCanonicalProject({
  title,
  tables,
  relationships,
  transform,
  database,
  notes,
  areas,
  types,
  enums,
}) {
  const modelName = requireNonblankString(title, "title");
  requireArray(tables, "tables");
  requireArray(relationships, "relationships");
  requireObject(transform, "transform");

  // Native files preserve every drawDB database target in drawdb_document.
  // The canonical physical model remains an empty, valid Snowflake projection
  // when the active database cannot be losslessly represented by that model.
  if (database !== undefined && database !== "snowflake") {
    const physical_model = {
      model_version: MODEL_VERSION,
      name: modelName,
      namespaces: [],
      tables: [],
      relationships: [],
    };
    return {
      project_version: PROJECT_VERSION,
      physical_model,
      diagram_layout: {
        nodes: {},
        viewport: {
          x: requireFiniteNumber(transform.pan?.x ?? 0, "viewport.x"),
          y: requireFiniteNumber(transform.pan?.y ?? 0, "viewport.y"),
          zoom: requireFiniteNumber(transform.zoom ?? 1, "viewport.zoom"),
        },
      },
      drawdb_document: validateDrawdbDocument({
        database,
        title,
        tables,
        relationships,
        notes: notes ?? [],
        areas: areas ?? [],
        types: types ?? [],
        enums: enums ?? [],
        transform,
      }),
    };
  }

  if (tables.length === 0) {
    if (relationships.length > 0) {
      fail("relationships are not allowed when tables are empty");
    }
    const pan = transform.pan || {};
    const zoom = requireFiniteNumber(transform.zoom ?? 1, "viewport.zoom");
    if (zoom <= 0) {
      fail("zoom must be a positive number");
    }
    const physical_model = {
      model_version: MODEL_VERSION,
      name: modelName,
      namespaces: [],
      tables: [],
      relationships: [],
    };
    assertNoForbiddenKeys(physical_model, "physical_model");
    const project = {
      project_version: PROJECT_VERSION,
      physical_model,
      diagram_layout: {
        nodes: {},
        viewport: {
          x: requireFiniteNumber(pan.x ?? 0, "viewport.x"),
          y: requireFiniteNumber(pan.y ?? 0, "viewport.y"),
          zoom,
        },
      },
    };
    if (database !== undefined) {
      project.drawdb_document = validateDrawdbDocument({
        database,
        title,
        tables,
        relationships,
        notes: notes ?? [],
        areas: areas ?? [],
        types: types ?? [],
        enums: enums ?? [],
        transform,
      });
    }
    return project;
  }

  const tablesWithNamespace = tables.filter((table) =>
    isPlainObject(table.namespace),
  );
  const tablesWithoutNamespace = tables.filter(
    (table) => !isPlainObject(table.namespace),
  );

  const legacyAllOmitNamespace = tablesWithNamespace.length === 0;
  if (!legacyAllOmitNamespace && tablesWithoutNamespace.length > 0) {
    fail(
      "mixed namespace presence is not supported; every table must include a namespace, or none may",
    );
  }

  function resolveTableNamespace(table) {
    if (legacyAllOmitNamespace) {
      return {
        id: namespaceId("MODEL", "PUBLIC"),
        catalog: "MODEL",
        schema: "PUBLIC",
      };
    }
    const catalog = toSnowflakeIdentifier(
      requireNonblankString(table.namespace.catalog, "catalog"),
      "catalog",
    );
    const schema = toSnowflakeIdentifier(
      requireNonblankString(table.namespace.schema, "schema"),
      "schema",
    );
    return {
      id: namespaceId(catalog, schema),
      catalog,
      schema,
    };
  }

  const namespaceById = new Map();
  for (const table of tables) {
    const namespace = resolveTableNamespace(table);
    if (!namespaceById.has(namespace.id)) {
      namespaceById.set(namespace.id, namespace);
    }
  }
  const namespaces = sortById([...namespaceById.values()]);

  const canonicalTableIdSeen = new Set();
  const tableIdSeen = new Set();
  const builtTables = [];
  const builtByOldId = new Map();
  const oldToNewColumnId = new Map();

  function columnMapKey(tableObjectId, fieldId) {
    return `${tableObjectId}\0${fieldId}`;
  }

  for (const table of tables) {
    if (tableIdSeen.has(table.id)) {
      fail(`duplicate table id ${JSON.stringify(table.id)}`);
    }
    tableIdSeen.add(table.id);

    const namespace = resolveTableNamespace(table);
    const tableName = toSnowflakeIdentifier(table.name, "table");
    const newTableId = tableId(namespace.catalog, namespace.schema, tableName);
    claimUniqueName(canonicalTableIdSeen, newTableId, "table");

    const fieldIdSeen = new Set();
    const columnNameSeen = new Set();
    const columns = (table.fields || []).map((field, index) => {
      if (fieldIdSeen.has(field.id)) {
        fail(
          `duplicate field id ${JSON.stringify(field.id)} in table ${JSON.stringify(table.name)}`,
        );
      }
      fieldIdSeen.add(field.id);

      const columnName = claimUniqueName(
        columnNameSeen,
        toSnowflakeIdentifier(field.name, "column"),
        "column",
      );
      const newColumnId = columnId(
        namespace.catalog,
        namespace.schema,
        tableName,
        columnName,
      );
      oldToNewColumnId.set(columnMapKey(table.id, field.id), newColumnId);
      return {
        id: newColumnId,
        name: columnName,
        ordinal: index + 1,
        data_type: dataTypeFromField({ ...field, name: columnName }),
        nullable: !field.notNull,
        default:
          field.default === undefined ||
          field.default === null ||
          field.default === ""
            ? null
            : String(field.default),
        comment:
          field.comment === undefined ||
          field.comment === null ||
          field.comment === ""
            ? null
            : String(field.comment),
        _primary: Boolean(field.primary),
        _unique: Boolean(field.unique),
        _oldName: field.name,
        _oldId: field.id,
      };
    });

    if (columns.length === 0) {
      fail(`table ${tableName} must have columns`);
    }

    const constraints = [];
    const uniqueNameSeen = new Set();
    const constraintView = isPlainObject(table.constraintView)
      ? table.constraintView
      : {};
    const pkColumns = columns.filter((c) => c._primary).map((c) => c.id);
    if (pkColumns.length > 0) {
      requireUniqueIds(pkColumns, "columns");
      const reusedPkName =
        typeof constraintView.primaryKeyName === "string" &&
        constraintView.primaryKeyName.trim()
          ? toSnowflakeIdentifier(constraintView.primaryKeyName, "constraint")
          : null;
      const pkName =
        reusedPkName || toSnowflakeIdentifier(`PK_${tableName}`, "constraint");
      claimUniqueName(uniqueNameSeen, pkName, "constraint");
      constraints.push({
        id: constraintId(
          namespace.catalog,
          namespace.schema,
          tableName,
          pkName,
        ),
        name: pkName,
        kind: "primary_key",
        columns: pkColumns,
        referenced_table_id: null,
        referenced_columns: [],
        expression: null,
      });
    }

    const storedUniqueNames = isPlainObject(constraintView.uniqueNames)
      ? constraintView.uniqueNames
      : {};
    for (const column of columns) {
      if (!column._unique) continue;
      const reusedUniqueName =
        typeof storedUniqueNames[column._oldId] === "string" &&
        storedUniqueNames[column._oldId].trim()
          ? toSnowflakeIdentifier(
              storedUniqueNames[column._oldId],
              "constraint",
            )
          : null;
      const uqName = claimUniqueName(
        uniqueNameSeen,
        reusedUniqueName ||
          toSnowflakeIdentifier(`UQ_${tableName}_${column.name}`, "constraint"),
        "constraint",
      );
      constraints.push({
        id: constraintId(
          namespace.catalog,
          namespace.schema,
          tableName,
          uqName,
        ),
        name: uqName,
        kind: "unique",
        columns: [column.id],
        referenced_table_id: null,
        referenced_columns: [],
        expression: null,
      });
    }

    for (const unique of table.uniqueConstraints || []) {
      const uqName = claimUniqueName(
        uniqueNameSeen,
        toSnowflakeIdentifier(unique.name || `UQ_${tableName}`, "constraint"),
        "constraint",
      );
      const fieldNames = unique.fields || [];
      const columnIds = fieldNames.map((fieldName) => {
        const normalized = toSnowflakeIdentifier(fieldName, "column");
        const column = columns.find((c) => c.name === normalized);
        if (!column) {
          fail(
            `unique constraint ${uqName} references unknown column ${JSON.stringify(fieldName)}`,
          );
        }
        return column.id;
      });
      if (columnIds.length < 2) {
        fail(`unique constraint ${uqName} must reference multiple columns`);
      }
      requireUniqueIds(columnIds, "columns");
      constraints.push({
        id: constraintId(
          namespace.catalog,
          namespace.schema,
          tableName,
          uqName,
        ),
        name: uqName,
        kind: "unique",
        columns: columnIds,
        referenced_table_id: null,
        referenced_columns: [],
        expression: null,
      });
    }

    const checkConstraints = getSnowflakeTableChecks(table, {
      reservedNames: [
        ...uniqueNameSeen,
        ...relationships
          .filter((relationship) => relationship.startTableId === table.id)
          .map((relationship) => relationship.name),
      ],
    });
    for (const check of checkConstraints) {
      claimUniqueName(uniqueNameSeen, check.name, "constraint");
      constraints.push({
        id: constraintId(
          namespace.catalog,
          namespace.schema,
          tableName,
          check.name,
        ),
        name: check.name,
        kind: "check",
        columns: [],
        referenced_table_id: null,
        referenced_columns: [],
        expression: check.expression,
      });
    }

    const built = {
      id: newTableId,
      namespace_id: namespace.id,
      name: tableName,
      kind: "table",
      columns: columns.map(
        ({
          id,
          name,
          ordinal,
          data_type,
          nullable,
          default: defaultValue,
          comment,
        }) => ({
          id,
          name,
          ordinal,
          data_type,
          nullable,
          default: defaultValue,
          comment,
        }),
      ),
      constraints: sortById(constraints),
      comment:
        table.comment === undefined ||
        table.comment === null ||
        table.comment === ""
          ? null
          : String(table.comment),
      _catalog: namespace.catalog,
      _schema: namespace.schema,
      _constraintNames: uniqueNameSeen,
      _x: requireFiniteNumber(table.x, "x"),
      _y: requireFiniteNumber(table.y, "y"),
      _oldId: table.id,
    };
    builtTables.push(built);
    builtByOldId.set(table.id, built);
  }

  const relationshipEndpointSeen = new Set();
  for (const rel of relationships) {
    const sourceTable = builtByOldId.get(rel.startTableId);
    const targetTable = builtByOldId.get(rel.endTableId);
    if (!sourceTable || !targetTable) {
      fail(`relationship ${rel.name} references unresolved tables`);
    }
    const fkName = claimUniqueName(
      sourceTable._constraintNames,
      toSnowflakeIdentifier(rel.name || `FK_${sourceTable.name}`, "constraint"),
      "constraint",
    );

    const pairs =
      Array.isArray(rel.fields) && rel.fields.length > 0
        ? rel.fields
        : [{ startFieldId: rel.startFieldId, endFieldId: rel.endFieldId }];

    if (pairs.length === 0) {
      fail("relationship source and target column lists must be non-empty");
    }

    const sourceColumnIds = pairs.map((pair) => {
      const mapped = oldToNewColumnId.get(
        columnMapKey(rel.startTableId, pair.startFieldId),
      );
      if (!mapped) {
        fail(
          `unresolved relationship source field ${JSON.stringify(pair.startFieldId)} on table ${JSON.stringify(rel.startTableId)}`,
        );
      }
      return mapped;
    });
    const targetColumnIds = pairs.map((pair) => {
      const mapped = oldToNewColumnId.get(
        columnMapKey(rel.endTableId, pair.endFieldId),
      );
      if (!mapped) {
        fail(
          `unresolved relationship target field ${JSON.stringify(pair.endFieldId)} on table ${JSON.stringify(rel.endTableId)}`,
        );
      }
      return mapped;
    });
    if (sourceColumnIds.length === 0 || targetColumnIds.length === 0) {
      fail("relationship source and target column lists must be non-empty");
    }
    if (sourceColumnIds.length !== targetColumnIds.length) {
      fail(
        "relationship source and target column lists must have equal length",
      );
    }
    requireUniqueIds(sourceColumnIds, "columns");
    requireUniqueIds(targetColumnIds, "referenced_columns");

    const endpointKey = JSON.stringify({
      source: sourceColumnIds,
      target: targetColumnIds,
      sourceTable: rel.startTableId,
      targetTable: rel.endTableId,
    });
    if (relationshipEndpointSeen.has(endpointKey)) {
      fail(
        `duplicate relationship endpoints between ${sourceTable.name} and ${targetTable.name}`,
      );
    }
    relationshipEndpointSeen.add(endpointKey);

    sourceTable.constraints.push({
      id: constraintId(
        sourceTable._catalog,
        sourceTable._schema,
        sourceTable.name,
        fkName,
      ),
      name: fkName,
      kind: "foreign_key",
      columns: sourceColumnIds,
      referenced_table_id: targetTable.id,
      referenced_columns: targetColumnIds,
      expression: null,
    });
    sourceTable.constraints = sortById(sourceTable.constraints);
  }

  const canonicalTables = sortById(
    builtTables.map((table) => ({
      id: table.id,
      namespace_id: table.namespace_id,
      name: table.name,
      kind: table.kind,
      columns: table.columns,
      constraints: table.constraints,
      comment: table.comment,
    })),
  );

  const canonicalRelationships = sortById(
    builtTables.flatMap((table) =>
      table.constraints
        .filter((constraint) => constraint.kind === "foreign_key")
        .map((constraint) => ({
          id: relationshipId(
            table._catalog,
            table._schema,
            table.name,
            constraint.name,
          ),
          name: constraint.name,
          source_table_id: table.id,
          source_column_ids: constraint.columns,
          target_table_id: constraint.referenced_table_id,
          target_column_ids: constraint.referenced_columns,
          cardinality: "many_to_one",
        })),
    ),
  );

  const nodes = {};
  for (const table of builtTables) {
    nodes[table.id] = { x: table._x, y: table._y };
  }

  const pan = transform.pan || {};
  const zoom = requireFiniteNumber(transform.zoom ?? 1, "viewport.zoom");
  if (zoom <= 0) {
    fail("zoom must be a positive number");
  }

  const physical_model = {
    model_version: MODEL_VERSION,
    name: modelName,
    namespaces,
    tables: canonicalTables,
    relationships: canonicalRelationships,
  };

  assertNoForbiddenKeys(physical_model, "physical_model");
  validatePhysicalModel(physical_model, { allowIncompleteVector: true });

  const project = {
    project_version: PROJECT_VERSION,
    physical_model,
    diagram_layout: {
      nodes: Object.fromEntries(
        Object.entries(nodes).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      viewport: {
        x: requireFiniteNumber(pan.x ?? 0, "viewport.x"),
        y: requireFiniteNumber(pan.y ?? 0, "viewport.y"),
        zoom,
      },
    },
  };
  if (database !== undefined) {
    project.drawdb_document = validateDrawdbDocument({
      database,
      title,
      tables,
      relationships,
      notes: notes ?? [],
      areas: areas ?? [],
      types: types ?? [],
      enums: enums ?? [],
      transform,
    });
  }
  return project;
}

function columnNameById(table, columnObjectId) {
  const column = table.columns.find((c) => c.id === columnObjectId);
  if (!column) {
    fail(`unknown column id ${JSON.stringify(columnObjectId)}`);
  }
  return column.name;
}

function tableById(model, tableObjectId) {
  const table = model.tables.find((t) => t.id === tableObjectId);
  if (!table) {
    fail(`unknown table id ${JSON.stringify(tableObjectId)}`);
  }
  return table;
}

function namespaceForTable(model, table) {
  const namespace = model.namespaces.find((ns) => ns.id === table.namespace_id);
  if (!namespace) {
    fail(
      `namespace_id references unknown namespace ${JSON.stringify(table.namespace_id)}`,
    );
  }
  return namespace;
}

function renderColumn(column) {
  const dataType = assertSnowflakeTypeExportable(column.data_type);
  const parts = [column.name, snowflakeTypeText(dataType)];
  if (!column.nullable) {
    parts.push("NOT NULL");
  }
  if (column.default !== null) {
    parts.push(`DEFAULT ${snowflakeDefaultLiteral(column.default)}`);
  }
  if (column.comment !== null) {
    parts.push(`COMMENT ${sqlStringLiteral(column.comment)}`);
  }
  return parts.join(" ");
}

function renderInlineConstraint(constraint, table) {
  if (constraint.kind === "check") {
    const expression = validateSnowflakeCheckExpression(
      constraint.expression,
    );
    // Outer trimming can leave a line comment at the end of the predicate.
    // Put our delimiter on a fresh line whenever a comment opener occurs;
    // an extra newline is harmless when that opener is inside quoted text.
    const closingLine = expression.includes("--") ? "\n" : "";
    return `CONSTRAINT ${constraint.name} CHECK (${expression}${closingLine})`;
  }
  const localList = constraint.columns
    .map((id) => columnNameById(table, id))
    .join(", ");
  if (constraint.kind === "primary_key") {
    return `CONSTRAINT ${constraint.name} PRIMARY KEY (${localList}) NOT ENFORCED`;
  }
  if (constraint.kind === "unique") {
    return `CONSTRAINT ${constraint.name} UNIQUE (${localList}) NOT ENFORCED`;
  }
  if (constraint.kind === "foreign_key") {
    fail("foreign_key constraints must be rendered as ALTER TABLE statements");
  }
  fail(`unsupported constraint kind ${constraint.kind}`);
}

function renderForeignKeyAlter(constraint, model, table, catalog, schema) {
  const localList = constraint.columns
    .map((id) => columnNameById(table, id))
    .join(", ");
  const target = tableById(model, constraint.referenced_table_id);
  const targetNamespace = namespaceForTable(model, target);
  const refList = constraint.referenced_columns
    .map((id) => columnNameById(target, id))
    .join(", ");
  return (
    `ALTER TABLE ${catalog}.${schema}.${table.name} ` +
    `ADD CONSTRAINT ${constraint.name} FOREIGN KEY (${localList}) ` +
    `REFERENCES ${targetNamespace.catalog}.${targetNamespace.schema}.${target.name} (${refList}) NOT ENFORCED;`
  );
}

function foreignKeyAlterStatements(model, ddlTables) {
  const statements = [];
  for (const table of ddlTables) {
    const namespace = namespaceForTable(model, table);
    for (const constraint of table.constraints) {
      if (constraint.kind !== "foreign_key") continue;
      statements.push(
        renderForeignKeyAlter(
          constraint,
          model,
          table,
          namespace.catalog,
          namespace.schema,
        ),
      );
    }
  }
  return statements.sort();
}

function splitSnowflakeStatements(sql) {
  const statements = [];
  let current = "";
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    current += char;
    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      if (quote === "'" && char === "\\" && next !== undefined) {
        current += next;
        index += 1;
      } else if (char === quote && next === quote) {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      current += next;
      index += 1;
      lineComment = true;
    } else if (char === "/" && next === "*") {
      current += next;
      index += 1;
      blockComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) fail("unsupported Snowflake DDL: unbalanced parentheses");
    } else if (char === ";" && depth === 0) {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }
  if (quote || blockComment || depth !== 0) {
    fail("unsupported Snowflake DDL: unterminated string or parentheses");
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

// Reject identifier quote syntaxes that this bounded parser cannot preserve,
// while ignoring quote-like bytes that belong to a supported SQL string or
// comment inside an opaque CHECK predicate.
function hasUnsupportedSnowflakeIdentifierQuotes(sql) {
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote === "'") {
      if (char === "\\" && next !== undefined) index += 1;
      else if (char === "'" && next === "'") index += 1;
      else if (char === "'") quote = null;
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'") {
      quote = char;
      continue;
    }
    if (char === '"' || char === "`" || char === "[") return true;
  }
  return false;
}

function splitSnowflakeTopLevelList(text) {
  const parts = [];
  let current = "";
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) {
      current += char;
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      current += char;
      if (char === "*" && next === "/") {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (quote) {
      current += char;
      if (quote === "'" && char === "\\" && next !== undefined) {
        current += next;
        index += 1;
      } else if (char === quote && next === quote) {
        current += next;
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === "-" && next === "-") {
      current += char + next;
      index += 1;
      lineComment = true;
    } else if (char === "/" && next === "*") {
      current += char + next;
      index += 1;
      blockComment = true;
    } else if (char === "'" || char === '"') {
      quote = char;
      current += char;
    } else if (char === "(") {
      depth += 1;
      current += char;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) fail("unsupported Snowflake DDL: unbalanced list");
      current += char;
    } else if (char === "," && depth === 0) {
      if (!current.trim()) fail("unsupported Snowflake DDL: empty list item");
      parts.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (quote || blockComment || depth !== 0) {
    fail("unsupported Snowflake DDL: unterminated list");
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function sqlStringLiteralValue(value) {
  const text = String(value).trim();
  if (!isSingleQuotedSqlLiteral(text)) {
    fail(`unsupported Snowflake DDL string literal ${JSON.stringify(value)}`);
  }
  return text.slice(1, -1).replaceAll("''", "'");
}

function parseSnowflakeIdentifier(value, label) {
  const text = String(value).trim();
  if (
    !text ||
    text.length > SNOWFLAKE_IDENTIFIER_MAX_LENGTH ||
    !/^[A-Z_][A-Z0-9_$]*$/i.test(text)
  ) {
    fail(`${label} must be a legal unquoted Snowflake identifier`);
  }
  return text.toUpperCase();
}

function parseQualifiedSnowflakeName(value, expectedParts, label) {
  const parts = String(value)
    .trim()
    .split(".")
    .map((part) => parseSnowflakeIdentifier(part, label));
  if (parts.length !== expectedParts) {
    fail(`${label} must be a ${expectedParts}-part unquoted Snowflake name`);
  }
  return parts;
}

function parseSnowflakeColumnList(value, label) {
  const columns = splitSnowflakeTopLevelList(value).map((column) =>
    parseSnowflakeIdentifier(column, label),
  );
  if (columns.length === 0) fail(`${label} must be non-empty`);
  return columns;
}

function escapeSnowflakeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const SNOWFLAKE_TYPE_ALIAS_PATTERNS = Object.keys(SNOWFLAKE_TYPE_ALIASES)
  .sort((left, right) => right.length - left.length)
  .map((alias) => ({
    alias,
    pattern: new RegExp(
      `^${alias
        .split(" ")
        .map((part) => escapeSnowflakeRegex(part))
        .join("\\s+")}(?=$|\\s|\\()`,
      "i",
    ),
  }));

function consumeSnowflakeTypeParameters(value, start, label) {
  let index = start;
  while (/\s/.test(value[index] ?? "")) index += 1;
  if (value[index] !== "(") return index;

  let depth = 0;
  let inString = false;
  for (; index < value.length; index += 1) {
    const char = value[index];
    if (inString) {
      if (char === "'" && value[index + 1] === "'") {
        index += 1;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
      if (depth < 0) break;
    }
  }
  fail(`unsupported Snowflake data type ${label}: unbalanced parameters`);
}

function splitSnowflakeColumnTypeAndRest(value) {
  const source = String(value).trim();
  for (const { pattern } of SNOWFLAKE_TYPE_ALIAS_PATTERNS) {
    const match = source.match(pattern);
    if (!match) continue;
    const expressionEnd = consumeSnowflakeTypeParameters(
      source,
      match[0].length,
      source,
    );
    return {
      rawType: source.slice(0, expressionEnd).trim(),
      rawRest: source.slice(expressionEnd).trim(),
    };
  }

  // Let the shared contract report the unsupported family while still
  // separating its optional parameter list from column clauses.
  const token = source.match(/^[A-Z_][A-Z0-9_$]*/i);
  if (!token) fail(`unsupported Snowflake data type ${source}`);
  const expressionEnd = consumeSnowflakeTypeParameters(
    source,
    token[0].length,
    source,
  );
  return {
    rawType: source.slice(0, expressionEnd).trim(),
    rawRest: source.slice(expressionEnd).trim(),
  };
}

function parseSnowflakeDataType(value, options = {}) {
  const contractOptions = {};
  if (Object.prototype.hasOwnProperty.call(options, "timestampTypeMapping")) {
    contractOptions.timestampTypeMapping = options.timestampTypeMapping;
  }
  return canonicalizeSnowflakeType(value, {
    ...contractOptions,
    label: `data type ${String(value).trim()}`,
  });
}

function isSnowflakeWordBoundary(value, index) {
  return index < 0 || index >= value.length || !/[A-Z0-9_$]/i.test(value[index]);
}

function consumeSnowflakeParenthesized(value, openIndex, label) {
  if (value[openIndex] !== "(") {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      `${label} must begin with an opening parenthesis`,
    );
  }
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = openIndex; index < value.length; index += 1) {
    const char = value[index];
    const next = value[index + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (quote === "'" && char === "\\" && next !== undefined) {
        index += 1;
      } else if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) break;
    }
  }
  checkFail(
    SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
    `${label} has unbalanced parentheses, quote, or comment delimiters`,
  );
}

function readSnowflakeColumnClause(rest, index) {
  const remaining = rest.slice(index);
  const notNull = remaining.match(/^NOT\s+NULL\b/i);
  if (notNull && isSnowflakeWordBoundary(rest, index - 1)) {
    return { kind: "NOT_NULL", start: index, end: index + notNull[0].length };
  }
  for (const kind of ["DEFAULT", "COMMENT"]) {
    if (
      remaining.length >= kind.length &&
      remaining.slice(0, kind.length).toUpperCase() === kind &&
      isSnowflakeWordBoundary(rest, index - 1) &&
      isSnowflakeWordBoundary(rest, index + kind.length)
    ) {
      return { kind, start: index, end: index + kind.length };
    }
  }
  const check = remaining.match(
    /^(?:CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+)?CHECK\b/i,
  );
  if (check && isSnowflakeWordBoundary(rest, index - 1)) {
    let openIndex = index + check[0].length;
    while (/\s/.test(rest[openIndex] ?? "")) openIndex += 1;
    const closeIndex = consumeSnowflakeParenthesized(
      rest,
      openIndex,
      "column CHECK",
    );
    return {
      kind: "CHECK",
      name: check[1] ? parseSnowflakeIdentifier(check[1], "constraint") : null,
      expression: validateSnowflakeCheckExpression(
        rest.slice(openIndex + 1, closeIndex),
      ),
      start: index,
      end: closeIndex + 1,
    };
  }
  return null;
}

function snowflakeColumnClauseStarts(rest) {
  const clauses = [];
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    const next = rest[index + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (quote === "'" && char === "\\" && next !== undefined) {
        index += 1;
      } else if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
    } else if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) fail("unsupported Snowflake column clause: unbalanced parentheses");
    } else if (depth === 0) {
      const clause = readSnowflakeColumnClause(rest, index);
      if (clause) {
        clauses.push(clause);
        index = clause.end - 1;
      }
    }
  }
  if (quote || blockComment || depth !== 0) {
    fail("unsupported Snowflake column clause: unterminated string or parentheses");
  }
  return clauses;
}

function unsupportedSnowflakeColumnFeature(rest) {
  const features = [
    "PRIMARY",
    "UNIQUE",
    "REFERENCES",
    "COLLATE",
    "IDENTITY",
    "AUTOINCREMENT",
  ];
  let depth = 0;
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    const next = rest[index + 1];
    if (lineComment) {
      if (char === "\n" || char === "\r") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (quote === "'" && char === "\\" && next !== undefined) {
        index += 1;
      } else if (char === quote && next === quote) {
        index += 1;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "-" && next === "-") {
      lineComment = true;
      index += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (depth === 0) {
      const remaining = rest.slice(index);
      const feature = features.find(
        (candidate) =>
          remaining.length >= candidate.length &&
          remaining.slice(0, candidate.length).toUpperCase() === candidate &&
          isSnowflakeWordBoundary(rest, index - 1) &&
          isSnowflakeWordBoundary(rest, index + candidate.length),
      );
      if (feature) return feature;
    }
  }
  return null;
}

function parseSnowflakeColumnClauses(rest, columnName) {
  let nullable = true;
  let defaultValue = null;
  let comment = null;
  const checkConstraints = [];
  const clauses = snowflakeColumnClauseStarts(rest);
  if (clauses.length === 0) {
    if (rest.trim()) {
      fail(`unsupported Snowflake column clause on ${columnName}: ${rest.trim()}`);
    }
    return { nullable, defaultValue, comment, checkConstraints };
  }
  if (rest.slice(0, clauses[0].start).trim()) {
    fail(
      `unsupported Snowflake column clause on ${columnName}: ${rest
        .slice(0, clauses[0].start)
        .trim()}`,
    );
  }
  clauses.forEach((clause, index) => {
    const value = rest
      .slice(clause.end, clauses[index + 1]?.start ?? rest.length)
      .trim();
    if (clause.kind === "NOT_NULL") {
      if (!nullable) fail(`duplicate NOT NULL clause on ${columnName}`);
      if (value) fail(`unsupported Snowflake column clause on ${columnName}: ${value}`);
      nullable = false;
    } else if (clause.kind === "DEFAULT") {
      if (defaultValue !== null) fail(`duplicate DEFAULT clause on ${columnName}`);
      if (!value) fail(`DEFAULT for ${columnName} must not be empty`);
      defaultValue = value;
    } else if (clause.kind === "COMMENT") {
      if (comment !== null) fail(`duplicate COMMENT clause on ${columnName}`);
      if (!isSingleQuotedSqlLiteral(value)) {
        fail(`unsupported Snowflake column comment on ${columnName}`);
      }
      comment = sqlStringLiteralValue(value);
    } else if (clause.kind === "CHECK") {
      if (value) {
        checkFail(
          SNOWFLAKE_CHECK_ERROR_CODES.UNSUPPORTED,
          `unsupported column CHECK suffix on ${columnName}: ${value}`,
        );
      }
      checkConstraints.push({
        name: clause.name,
        expression: validateSnowflakeCheckExpression(clause.expression),
      });
    }
  });
  return { nullable, defaultValue, comment, checkConstraints };
}

function parseSnowflakeColumnDefinition(
  definition,
  tableParts,
  ordinal,
  options = {},
) {
  const match = definition.match(/^([A-Z_][A-Z0-9_$]*)\s+([\s\S]*)$/i);
  if (!match) {
    fail(`unsupported Snowflake column definition ${JSON.stringify(definition)}`);
  }
  const [, rawName, rawTypeAndRest] = match;
  const name = parseSnowflakeIdentifier(rawName, "column");
  const { rawType, rawRest } = splitSnowflakeColumnTypeAndRest(
    rawTypeAndRest,
  );
  if (unsupportedSnowflakeColumnFeature(rawRest)) {
    fail(`unsupported Snowflake column feature on ${name}`);
  }
  const { nullable, defaultValue, comment, checkConstraints } =
    parseSnowflakeColumnClauses(
    rawRest.trim(),
    name,
  );

  const [catalog, schema, tableName] = tableParts;
  return {
    column: {
      id: columnId(catalog, schema, tableName, name),
      name,
      ordinal,
      data_type: parseSnowflakeDataType(rawType, options),
      nullable,
      default: defaultValue,
      comment,
    },
    checkConstraints,
  };
}

function parseSnowflakeCheckConstraintDefinition(definition, label = "table CHECK") {
  const prefix = definition.match(
    /^(?:CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+)?CHECK\b/i,
  );
  if (!prefix) return null;
  let openIndex = prefix[0].length;
  while (/\s/.test(definition[openIndex] ?? "")) openIndex += 1;
  const closeIndex = consumeSnowflakeParenthesized(
    definition,
    openIndex,
    label,
  );
  const suffix = definition.slice(closeIndex + 1).trim();
  if (suffix) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.UNSUPPORTED,
      `${label} has unsupported suffix ${JSON.stringify(suffix)}`,
    );
  }
  return {
    name: prefix[1] ? parseSnowflakeIdentifier(prefix[1], "constraint") : null,
    expression: validateSnowflakeCheckExpression(
      definition.slice(openIndex + 1, closeIndex),
    ),
  };
}

function parseSnowflakeInlineConstraint(definition, tableParts, columnsByName) {
  const check = parseSnowflakeCheckConstraintDefinition(definition);
  if (check) return check;
  const match = definition.match(
    /^CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+(PRIMARY\s+KEY|UNIQUE)\s*\(([\s\S]+)\)\s+NOT\s+ENFORCED$/i,
  );
  if (!match) {
    fail(`unsupported Snowflake table constraint ${JSON.stringify(definition)}`);
  }
  const [, rawName, rawKind, rawColumns] = match;
  const name = parseSnowflakeIdentifier(rawName, "constraint");
  const columnNames = parseSnowflakeColumnList(rawColumns, "constraint column");
  const columns = columnNames.map((columnName) => {
    const column = columnsByName.get(columnName);
    if (!column) fail(`constraint ${name} references unknown column ${columnName}`);
    return column.id;
  });
  const [catalog, schema, tableName] = tableParts;
  return {
    id: constraintId(catalog, schema, tableName, name),
    name,
    kind: rawKind.replace(/\s+/g, "_").toLowerCase(),
    columns,
    referenced_table_id: null,
    referenced_columns: [],
    expression: null,
  };
}

function parseSnowflakeCreateTable(statement, options = {}, futureCheckNames = []) {
  const match = statement.match(
    /^CREATE\s+TABLE\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)\s*\(([\s\S]*)\)\s*(?:COMMENT\s*=\s*('(?:[^']|'')*'))?$/i,
  );
  if (!match) fail(`unsupported Snowflake CREATE TABLE statement`);
  const [, rawTableName, body, rawComment] = match;
  const [catalog, schema, name] = parseQualifiedSnowflakeName(
    rawTableName,
    3,
    "table",
  );
  const tableParts = [catalog, schema, name];
  const columns = [];
  const constraints = [];
  const columnsByName = new Map();
  const pendingConstraints = [];
  const pendingChecks = [];
  splitSnowflakeTopLevelList(body).forEach((definition) => {
    if (
      /^(?:CONSTRAINT\s+[^\s]+\s+)?CHECK\b/i.test(definition)
    ) {
      pendingChecks.push({
        ...parseSnowflakeCheckConstraintDefinition(definition),
        source: "table",
      });
      return;
    }
    if (/^CONSTRAINT\s+/i.test(definition)) {
      pendingConstraints.push(definition);
      return;
    }
    const parsedColumn = parseSnowflakeColumnDefinition(
      definition,
      tableParts,
      columns.length + 1,
      options,
    );
    const { column } = parsedColumn;
    if (columnsByName.has(column.name)) {
      fail(`duplicate column ${column.name} in ${name}`);
    }
    columnsByName.set(column.name, column);
    columns.push(column);
    pendingChecks.push(
      ...parsedColumn.checkConstraints.map((check) => ({
        ...check,
        source: "column",
        columnName: column.name,
      })),
    );
  });
  if (columns.length === 0) fail(`table ${name} must have columns`);

  // Resolve named PK/UQ constraints after all columns are known.  Reserving
  // these names before generated CHECK names makes unnamed checks collision
  // safe regardless of declaration order.
  for (const definition of pendingConstraints) {
    constraints.push(
      parseSnowflakeInlineConstraint(definition, tableParts, columnsByName),
    );
  }
  const constraintNames = new Set(constraints.map((constraint) => constraint.name));
  const explicitCheckNames = new Set();
  for (const pendingCheck of pendingChecks) {
    if (!pendingCheck.name) continue;
    const explicitName = parseSnowflakeIdentifier(
      pendingCheck.name,
      "constraint",
    );
    if (constraintNames.has(explicitName) || explicitCheckNames.has(explicitName)) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
        `CHECK name collision in ${name}: ${explicitName}`,
      );
    }
    explicitCheckNames.add(explicitName);
    constraintNames.add(explicitName);
  }
  for (const futureName of futureCheckNames) constraintNames.add(futureName);
  let checkOrdinal = 0;
  for (const pendingCheck of pendingChecks) {
    checkOrdinal += 1;
    const nameValue = pendingCheck.name
      ? parseSnowflakeIdentifier(pendingCheck.name, "constraint")
      : boundedGeneratedCheckName(`CK_${name}_${checkOrdinal}`, constraintNames);
    constraints.push({
      id: constraintId(catalog, schema, name, nameValue),
      name: nameValue,
      kind: "check",
      columns: [],
      referenced_table_id: null,
      referenced_columns: [],
      expression: validateSnowflakeCheckExpression(pendingCheck.expression),
    });
  }
  return {
    namespace: { id: namespaceId(catalog, schema), catalog, schema },
    table: {
      id: tableId(catalog, schema, name),
      namespace_id: namespaceId(catalog, schema),
      name,
      kind: "table",
      columns,
      constraints,
      comment: rawComment === undefined ? null : sqlStringLiteralValue(rawComment),
    },
  };
}

function parseSnowflakeForeignKeyAlter(statement, tableByName) {
  const match = statement.match(
    /^ALTER\s+TABLE\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)\s+ADD\s+CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+FOREIGN\s+KEY\s*\(([\s\S]+?)\)\s+REFERENCES\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)\s*\(([\s\S]+?)\)\s+NOT\s+ENFORCED$/i,
  );
  if (!match) fail(`unsupported Snowflake ALTER TABLE statement`);
  const [, rawSource, rawName, rawSourceColumns, rawTarget, rawTargetColumns] =
    match;
  const sourceParts = parseQualifiedSnowflakeName(rawSource, 3, "table");
  const targetParts = parseQualifiedSnowflakeName(rawTarget, 3, "table");
  const sourceTable = tableByName.get(sourceParts.join("."));
  const targetTable = tableByName.get(targetParts.join("."));
  if (!sourceTable || !targetTable) {
    fail("foreign key references an unknown table");
  }
  const sourceColumns = parseSnowflakeColumnList(rawSourceColumns, "foreign key column");
  const targetColumns = parseSnowflakeColumnList(rawTargetColumns, "referenced column");
  if (sourceColumns.length !== targetColumns.length) {
    fail("foreign key column counts must match");
  }
  const sourceIds = sourceColumns.map((name) => {
    const column = sourceTable.columns.find((c) => c.name === name);
    if (!column) fail(`foreign key references unknown source column ${name}`);
    return column.id;
  });
  const targetIds = targetColumns.map((name) => {
    const column = targetTable.columns.find((c) => c.name === name);
    if (!column) fail(`foreign key references unknown target column ${name}`);
    return column.id;
  });
  const name = parseSnowflakeIdentifier(rawName, "constraint");
  return {
    sourceTable,
    constraint: {
      id: constraintId(sourceParts[0], sourceParts[1], sourceParts[2], name),
      name,
      kind: "foreign_key",
      columns: sourceIds,
      referenced_table_id: targetTable.id,
      referenced_columns: targetIds,
      expression: null,
    },
  };
}

function parseSnowflakeCheckAlter(statement, tableByName, futureCheckNames = new Map()) {
  const match = statement.match(
    /^ALTER\s+TABLE\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)\s+ADD\s+([\s\S]*)$/i,
  );
  if (!match) return null;
  const sourceParts = parseQualifiedSnowflakeName(match[1], 3, "table");
  const sourceTable = tableByName.get(sourceParts.join("."));
  if (!sourceTable) {
    fail("CHECK references an unknown table");
  }
  const check = parseSnowflakeCheckConstraintDefinition(match[2], "ALTER TABLE CHECK");
  if (!check) return null;
  const seenNames = new Set(sourceTable.constraints.map((constraint) => constraint.name));
  const checkOrdinal =
    sourceTable.constraints.filter((constraint) => constraint.kind === "check")
      .length + 1;
  const name = check.name
    ? parseSnowflakeIdentifier(check.name, "constraint")
    : boundedGeneratedCheckName(
        `CK_${sourceTable.name}_${checkOrdinal}`,
        new Set([...seenNames, ...(futureCheckNames.get(sourceParts.join(".")) ?? [])]),
      );
  if (check.name && seenNames.has(name)) {
    checkFail(
      SNOWFLAKE_CHECK_ERROR_CODES.INVALID,
      `CHECK name collision in ${sourceTable.name}: ${name}`,
    );
  }
  return {
    sourceTable,
    constraint: {
      id: constraintId(
        sourceParts[0],
        sourceParts[1],
        sourceParts[2],
        name,
      ),
      name,
      kind: "check",
      columns: [],
      referenced_table_id: null,
      referenced_columns: [],
      expression: check.expression,
    },
  };
}

export function parseSnowflakeDDLToCanonicalProject(sql, options = {}) {
  if (typeof sql !== "string" || !sql.trim()) {
    fail("Snowflake DDL must be a nonblank string");
  }
  if (/\bRELY\b/i.test(sql)) {
    fail("unsupported Snowflake DDL: RELY constraints are not imported");
  }
  if (hasUnsupportedSnowflakeIdentifierQuotes(sql)) {
    fail("unsupported Snowflake DDL: quoted identifiers are not imported");
  }
  const namespaceById = new Map();
  const tableByName = new Map();
  const tables = [];
  const statements = splitSnowflakeStatements(sql);
  // Reserve user-supplied ALTER CHECK names before allocating unnamed checks
  // in either CREATE or ALTER. This scan recognizes only the supported header;
  // the actual CHECK predicate is still parsed and validated below.
  const futureCheckNames = new Map();
  for (const statement of statements) {
    const header = statement.match(/^ALTER\s+TABLE\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)\s+ADD\s+CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+CHECK\b/i);
    if (!header) continue;
    const tableName = header[1].toUpperCase();
    if (!futureCheckNames.has(tableName)) futureCheckNames.set(tableName, new Set());
    futureCheckNames.get(tableName).add(parseSnowflakeIdentifier(header[2], "constraint"));
  }
  for (const statement of statements) {
    if (/^CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+/i.test(statement)) {
      const [, catalog] = statement.match(
        /^CREATE\s+DATABASE\s+IF\s+NOT\s+EXISTS\s+([A-Z_][A-Z0-9_$]*)$/i,
      ) || [null, null];
      if (!catalog) fail("unsupported Snowflake CREATE DATABASE statement");
      parseSnowflakeIdentifier(catalog, "catalog");
    } else if (/^CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+/i.test(statement)) {
      const [, rawNamespace] = statement.match(
        /^CREATE\s+SCHEMA\s+IF\s+NOT\s+EXISTS\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)$/i,
      ) || [null, null];
      if (!rawNamespace) fail("unsupported Snowflake CREATE SCHEMA statement");
      const [catalog, schema] = parseQualifiedSnowflakeName(
        rawNamespace,
        2,
        "schema",
      );
      namespaceById.set(namespaceId(catalog, schema), {
        id: namespaceId(catalog, schema),
        catalog,
        schema,
      });
    } else if (/^CREATE\s+TABLE\s+/i.test(statement)) {
      const tableName = statement.match(/^CREATE\s+TABLE\s+([^\s(]+)/i)?.[1]?.toUpperCase();
      const { namespace, table } = parseSnowflakeCreateTable(statement, options, futureCheckNames.get(tableName));
      namespaceById.set(namespace.id, namespace);
      if (tableByName.has(`${namespace.catalog}.${namespace.schema}.${table.name}`)) {
        fail(`duplicate table ${namespace.catalog}.${namespace.schema}.${table.name}`);
      }
      tableByName.set(`${namespace.catalog}.${namespace.schema}.${table.name}`, table);
      tables.push(table);
    } else if (/^ALTER\s+TABLE\s+/i.test(statement)) {
      const checkAlter = parseSnowflakeCheckAlter(statement, tableByName, futureCheckNames);
      if (checkAlter) {
        checkAlter.sourceTable.constraints.push(checkAlter.constraint);
        continue;
      }
      const { sourceTable, constraint } = parseSnowflakeForeignKeyAlter(
        statement,
        tableByName,
      );
      sourceTable.constraints.push(constraint);
    } else {
      fail(`unsupported Snowflake DDL statement: ${statement.slice(0, 60)}`);
    }
  }
  const namespaces = sortById([...namespaceById.values()]);
  const canonicalTables = sortById(
    tables.map((table) => ({
      ...table,
      constraints: sortById(table.constraints),
    })),
  );
  const relationships = sortById(
    canonicalTables.flatMap((table) => {
      const namespace = namespaceById.get(table.namespace_id);
      return table.constraints
        .filter((constraint) => constraint.kind === "foreign_key")
        .map((constraint) => ({
          id: relationshipId(
            namespace.catalog,
            namespace.schema,
            table.name,
            constraint.name,
          ),
          name: constraint.name,
          source_table_id: table.id,
          source_column_ids: constraint.columns,
          target_table_id: constraint.referenced_table_id,
          target_column_ids: constraint.referenced_columns,
          cardinality: "many_to_one",
        }));
    }),
  );
  const physical_model = {
    model_version: MODEL_VERSION,
    name:
      typeof options.name === "string" && options.name.trim()
        ? options.name.trim()
        : "snowflake-import",
    namespaces,
    tables: canonicalTables,
    relationships,
  };
  validatePhysicalModel(physical_model);
  const nodes = {};
  canonicalTables.forEach((table, index) => {
    nodes[table.id] = fallbackPosition(index);
  });
  return {
    project_version: PROJECT_VERSION,
    physical_model,
    diagram_layout: {
      nodes,
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

export function parseSnowflakeDDLToDiagram(sql, options = {}) {
  const project = parseSnowflakeDDLToCanonicalProject(sql, options);
  return {
    ...canonicalProjectToDiagram(project),
    database: "snowflake",
    notes: [],
    areas: [],
    types: [],
    enums: [],
  };
}

function modelForSnowflakeRendering(projectOrModel) {
  if (
    isPlainObject(projectOrModel) &&
    "physical_model" in projectOrModel &&
    "project_version" in projectOrModel
  ) {
    const model = validatePhysicalModel(projectOrModel.physical_model);
    const rawDocument = projectOrModel.drawdb_document;
    if (rawDocument !== undefined) {
      const canonicalHasChecks = model.tables.some((table) => table.constraints.some((constraint) => constraint.kind === "check"));
      const rawHasChecks = Array.isArray(rawDocument?.tables) && rawDocument.tables.some((table) => getSnowflakeTableChecks(table).length > 0);
      if (canonicalHasChecks || rawHasChecks) {
        try {
          const document = validateDrawdbDocument(rawDocument);
          if (document.database !== "snowflake") {
            checkFail(SNOWFLAKE_CHECK_ERROR_CODES.LOSS, "The embedded editor document cannot represent Snowflake CHECK constraints");
          }
          // Do not let a public renderer bypass the same CHECK consistency
          // rules used by project reopening. Legacy raw-only CHECKs must first
          // migrate through open/save, never silently disappear during export.
          reconcileCanonicalTypesIntoDrawdbDocument(document, model);
        } catch (error) {
          if (error instanceof SnowflakeCheckError) throw error;
          checkFail(SNOWFLAKE_CHECK_ERROR_CODES.LOSS, `Cannot reconcile embedded CHECK data for export; reopen and save legacy projects before exporting: ${error.message}`);
        }
      }
    }
    return model;
  }
  return validatePhysicalModel(projectOrModel);
}

export function renderCanonicalSnowflakeDDL(projectOrModel) {
  const model = modelForSnowflakeRendering(projectOrModel);

  const lines = [];
  const catalogs = [
    ...new Set(model.namespaces.map((ns) => ns.catalog)),
  ].sort();
  for (const catalog of catalogs) {
    lines.push(`CREATE DATABASE IF NOT EXISTS ${catalog};`);
  }
  for (const namespace of model.namespaces) {
    lines.push(
      `CREATE SCHEMA IF NOT EXISTS ${namespace.catalog}.${namespace.schema};`,
    );
  }
  if (model.namespaces.length) {
    lines.push("");
  }

  // Tables are already validated as sorted by id; emit CREATE TABLE in that order.
  const ddlTables = model.tables;
  ddlTables.forEach((table, index) => {
    const namespace = namespaceForTable(model, table);
    lines.push(
      `CREATE TABLE ${namespace.catalog}.${namespace.schema}.${table.name} (`,
    );
    const bodyLines = [
      ...table.columns.map((column) => `    ${renderColumn(column)}`),
      ...table.constraints
        .filter((constraint) => constraint.kind !== "foreign_key")
        .map(
          (constraint) => `    ${renderInlineConstraint(constraint, table)}`,
        ),
    ];
    bodyLines.forEach((bodyLine, bodyIndex) => {
      const suffix = bodyIndex < bodyLines.length - 1 ? "," : "";
      lines.push(`${bodyLine}${suffix}`);
    });
    if (table.comment !== null) {
      lines.push(`) COMMENT=${sqlStringLiteral(table.comment)};`);
    } else {
      lines.push(");");
    }
    if (index < ddlTables.length - 1) {
      lines.push("");
    }
  });

  const fkAlters = foreignKeyAlterStatements(model, ddlTables);
  if (fkAlters.length) {
    if (lines.length && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(...fkAlters);
  }

  return `${lines.join("\n")}\n`;
}

function assertCheckNamespaceOverrideSafe(
  model,
  databaseOverride,
  schemaOverride,
) {
  if (databaseOverride === undefined && schemaOverride === undefined) return;
  for (const table of model.tables) {
    if (!table.constraints.some((constraint) => constraint.kind === "check")) {
      continue;
    }
    const namespace = namespaceForTable(model, table);
    const databaseMatches =
      databaseOverride === undefined ||
      String(databaseOverride).toUpperCase() === namespace.catalog;
    const schemaMatches =
      schemaOverride === undefined ||
      String(schemaOverride).toUpperCase() === namespace.schema;
    if (!databaseMatches || !schemaMatches) {
      checkFail(
        SNOWFLAKE_CHECK_ERROR_CODES.STRUCTURAL_EDIT,
        `namespace override would invalidate opaque CHECK expressions on ${namespace.catalog}.${namespace.schema}.${table.name}`,
      );
    }
  }
}

export function renderCanonicalSnowflakeStatements(
  projectOrModel,
  options = {},
) {
  const model = modelForSnowflakeRendering(projectOrModel);

  const { databaseOverride, schemaOverride, replace = false } = options;
  assertCheckNamespaceOverrideSafe(model, databaseOverride, schemaOverride);
  const statements = [];
  const catalogs = [
    ...new Set(model.namespaces.map((ns) => databaseOverride || ns.catalog)),
  ].sort();
  for (const catalog of catalogs) {
    statements.push(`CREATE DATABASE IF NOT EXISTS ${catalog};`);
  }
  for (const namespace of model.namespaces) {
    const db = databaseOverride || namespace.catalog;
    const sch = schemaOverride || namespace.schema;
    statements.push(`CREATE SCHEMA IF NOT EXISTS ${db}.${sch};`);
  }

  const ddlTables = model.tables;
  ddlTables.forEach((table) => {
    const namespace = namespaceForTable(model, table);
    const db = databaseOverride || namespace.catalog;
    const sch = schemaOverride || namespace.schema;
    const createPrefix = replace
      ? "CREATE OR REPLACE TABLE"
      : "CREATE TABLE IF NOT EXISTS";
    const lines = [`${createPrefix} ${db}.${sch}.${table.name} (`];
    const bodyLines = [
      ...table.columns.map((column) => `    ${renderColumn(column)}`),
      ...table.constraints
        .filter((constraint) => constraint.kind !== "foreign_key")
        .map((constraint) => `    ${renderInlineConstraint(constraint, table)}`),
    ];
    bodyLines.forEach((bodyLine, bodyIndex) => {
      const suffix = bodyIndex < bodyLines.length - 1 ? "," : "";
      lines.push(`${bodyLine}${suffix}`);
    });
    if (table.comment !== null) {
      lines.push(`) COMMENT=${sqlStringLiteral(table.comment)};`);
    } else {
      lines.push(");");
    }
    statements.push(lines.join("\n"));
  });

  const fkAlters = foreignKeyAlterStatements(model, ddlTables);
  statements.push(...fkAlters);

  return statements;
}
