import {
  validateSnowflakeType,
  snowflakeTypeSize,
  snowflakeTypeFromField,
  canonicalizeSnowflakeType,
} from "./snowflakeTypeContract.js";

const PROJECT_VERSION = "1";
const MODEL_VERSION = "2";
const LEGACY_MODEL_VERSION = "1";
const SNOWFLAKE_IDENTIFIER_MAX_LENGTH = 255;
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
  "check_constraints",
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
const DATA_TYPE_KEYS = new Set([
  "family",
  "text",
  "precision",
  "scale",
  "length",
  "vector_element_type",
  "vector_dimension",
]);
const LEGACY_TABLE_KEYS = new Set(
  [...TABLE_KEYS].filter((key) => key !== "check_constraints"),
);
const LEGACY_DATA_TYPE_KEYS = new Set(
  [...DATA_TYPE_KEYS].filter(
    (key) => key !== "vector_element_type" && key !== "vector_dimension",
  ),
);
const CONSTRAINT_KEYS = new Set([
  "id",
  "name",
  "kind",
  "columns",
  "referenced_table_id",
  "referenced_columns",
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
  "checkConstraints",
  "color",
  "inherits",
  "namespace",
  "constraintView",
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
const CHECK_CONSTRAINT_KEYS = new Set([
  "id",
  "name",
  "expression",
  "validation",
  "name_origin",
]);
const DRAWDB_CHECK_CONSTRAINT_KEYS = new Set([
  "id",
  "name",
  "expression",
  "validation",
  "nameOrigin",
]);
const CHECK_VALIDATION_VALUES = new Set(["VALIDATE", "UNKNOWN"]);
const CHECK_NAME_ORIGIN_VALUES = new Set(["explicit", "unnamed", "unknown"]);
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

function failWithCode(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

const LEGACY_FIELD_CHECK_ERROR_CODE = "LEGACY_FIELD_CHECK_UNSUPPORTED";
const LEGACY_FIELD_CHECK_ERROR_MESSAGE =
  "Legacy field.check requires explicit migration to table.checkConstraints";
const UNRESOLVED_VECTOR_ERROR_CODE = "UNRESOLVED_VECTOR";
const UNRESOLVED_VECTOR_ERROR_MESSAGE =
  "VECTOR requires an INT or FLOAT element type and a positive dimension";
const CANONICAL_EDITOR_SEMANTIC_MISMATCH_ERROR_CODE =
  "CANONICAL_EDITOR_SEMANTIC_MISMATCH";
const CANONICAL_EDITOR_SEMANTIC_MISMATCH_ERROR_MESSAGE =
  "drawdb_document semantics do not match authoritative physical_model";

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
    const checkConstraintIds = new Set();
    requireArray(
      table.checkConstraints ?? [],
      `${tableLabel}.checkConstraints`,
    ).forEach((check, checkIndex) => {
      const checkLabel = `${tableLabel}.checkConstraints[${checkIndex}]`;
      rejectUnexpectedKeys(
        check,
        DRAWDB_CHECK_CONSTRAINT_KEYS,
        checkLabel,
      );
      requireExactKeys(check, DRAWDB_CHECK_CONSTRAINT_KEYS, checkLabel);
      const checkId = requireEntityId(check.id, `${checkLabel}.id`);
      const checkIdStr = String(checkId);
      if (checkConstraintIds.has(checkIdStr)) {
        fail(`${checkLabel}.id must be unique`);
      }
      checkConstraintIds.add(checkIdStr);

      if (check.name !== null) {
        requireLegalSnowflakeIdentifier(check.name, `${checkLabel}.name`);
      }

      if (typeof check.expression !== "string" || !check.expression.trim()) {
        fail(`${checkLabel}.expression must be a nonblank string`);
      }
      if (check.expression !== check.expression.trim()) {
        fail(`${checkLabel}.expression must be trimmed`);
      }

      if (!CHECK_VALIDATION_VALUES.has(check.validation)) {
        fail(`${checkLabel}.validation must be "VALIDATE" or "UNKNOWN"`);
      }

      if (!CHECK_NAME_ORIGIN_VALUES.has(check.nameOrigin)) {
        fail(
          `${checkLabel}.nameOrigin must be "explicit", "unnamed", or "unknown"`,
        );
      }

      if (check.nameOrigin === "unnamed" && check.name !== null) {
        fail(`${checkLabel}: nameOrigin "unnamed" requires name to be null`);
      }
      if (check.nameOrigin !== "unnamed" && check.name === null) {
        fail(
          `${checkLabel}: nameOrigin "${check.nameOrigin}" requires a non-null name`,
        );
      }
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

function validateDataType(dataType, label = "data_type") {
  requireObject(dataType, label);
  requireExactKeys(dataType, DATA_TYPE_KEYS, label);
  try {
    return validateSnowflakeType(dataType);
  } catch (err) {
    if (
      /VECTOR requires both vector_element_type and vector_dimension or neither/i.test(
        err.message,
      )
    ) {
      fail(
        `${label}.vector_element_type and ${label}.vector_dimension must remain null for the unresolved VECTOR scaffold`,
      );
    }
    if (
      /vector_element_type and vector_dimension must be null/i.test(err.message)
    ) {
      fail(
        `${label}.vector_element_type and ${label}.vector_dimension must be null for ${dataType.family}`,
      );
    }
    if (/^text must equal/i.test(err.message)) {
      fail(`${label}.${err.message}`);
    }
    fail(`${label}: ${err.message}`);
  }
}

function fieldSizeFromDataType(dataType) {
  return snowflakeTypeSize(dataType);
}

function dataTypeFromField(field, options = {}) {
  return snowflakeTypeFromField(field, options);
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
  if (database === "snowflake") {
    rejectLegacyFieldChecks(tables);
  }
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

function rejectLegacyFieldChecks(tables) {
  if (!Array.isArray(tables)) return;
  for (const table of tables) {
    if (!isPlainObject(table) || !Array.isArray(table.fields)) continue;
    for (const field of table.fields) {
      if (
        isPlainObject(field) &&
        typeof field.check === "string" &&
        field.check.trim()
      ) {
        failWithCode(
          LEGACY_FIELD_CHECK_ERROR_CODE,
          LEGACY_FIELD_CHECK_ERROR_MESSAGE,
        );
      }
    }
  }
}

function validateCanonicalCheckConstraint(check, index) {
  const label = `check_constraints[${index}]`;
  requireObject(check, label);
  requireExactKeys(check, CHECK_CONSTRAINT_KEYS, label);

  const id = requireNonblankString(check.id, `${label}.id`);

  if (check.name !== null) {
    requireLegalSnowflakeIdentifier(check.name, `${label}.name`);
  }

  if (typeof check.expression !== "string" || !check.expression.trim()) {
    fail(`${label}.expression must be a nonblank string`);
  }
  if (check.expression !== check.expression.trim()) {
    fail(`${label}.expression must be trimmed`);
  }

  if (!CHECK_VALIDATION_VALUES.has(check.validation)) {
    fail(`${label}.validation must be "VALIDATE" or "UNKNOWN"`);
  }

  if (!CHECK_NAME_ORIGIN_VALUES.has(check.name_origin)) {
    fail(`${label}.name_origin must be "explicit", "unnamed", or "unknown"`);
  }

  if (check.name_origin === "unnamed" && check.name !== null) {
    fail(`${label}: name_origin "unnamed" requires name to be null`);
  }
  if (check.name_origin !== "unnamed" && check.name === null) {
    fail(`${label}: name_origin "${check.name_origin}" requires a non-null name`);
  }

  return {
    id,
    name: check.name,
    expression: check.expression,
    validation: check.validation,
    name_origin: check.name_origin,
  };
}

function validatePhysicalModelV2(model) {
  requireObject(model, "physical_model");
  requireExactKeys(model, PHYSICAL_MODEL_KEYS, "physical model");
  assertNoForbiddenKeys(model, "physical_model");

  const modelVersion = requireNonblankString(
    model.model_version,
    "model_version",
  );
  if (modelVersion !== MODEL_VERSION) {
    fail(
      `Unsupported model_version ${JSON.stringify(modelVersion)}; expected "2"`,
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
          data_type: validateDataType(column.data_type, "data_type"),
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

    const rawCheckConstraints = requireArray(
      table.check_constraints,
      "check_constraints",
    );
    const checkIds = new Set();
    const checkConstraints = rawCheckConstraints.map((check, cIndex) => {
      const validated = validateCanonicalCheckConstraint(check, cIndex);
      if (checkIds.has(validated.id)) {
        fail(`check_constraints[${cIndex}].id must be unique`);
      }
      checkIds.add(validated.id);
      return validated;
    });
    const sortedChecks = sortById(checkConstraints);
    if (sortedChecks.some((c, i) => c.id !== checkConstraints[i].id)) {
      fail("check_constraints must be sorted by id");
    }

    const constraints = requireArray(table.constraints, "constraints").map(
      (constraint, cIndex) => {
        requireObject(constraint, `constraints[${cIndex}]`);
        requireExactKeys(constraint, CONSTRAINT_KEYS, "constraint");
        const constraintColumns = requireArray(
          constraint.columns,
          "columns",
        ).map((id) => requireNonblankString(id, "constraint column id"));
        if (constraintColumns.length === 0) {
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
          kind: requireNonblankString(constraint.kind, "kind"),
          columns: constraintColumns,
          referenced_table_id:
            constraint.referenced_table_id === null
              ? null
              : requireNonblankString(
                  constraint.referenced_table_id,
                  "referenced_table_id",
                ),
          referenced_columns: referencedColumns,
        };
      },
    );
    const sortedConstraints = sortById(constraints);
    if (sortedConstraints.some((c, i) => c.id !== constraints[i].id)) {
      fail("constraints must be sorted by id");
    }
    const constraintIds = constraints.map((constraint) => constraint.id);
    requireUniqueIds(constraintIds, "constraints");
    // Named CHECKs and key constraints share the constraint:<...> id scheme, so
    // uniqueness must hold across both arrays, not just within each.
    for (const constraintId of constraintIds) {
      if (checkIds.has(constraintId)) {
        fail(
          `constraint id ${constraintId} is used by both constraints and check_constraints`,
        );
      }
    }
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
      check_constraints: checkConstraints,
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
    model_version: modelVersion,
    name,
    namespaces,
    tables,
    relationships,
  };
}

function migratePhysicalModelV1ToV2(model) {
  requireObject(model, "physical_model");
  requireExactKeys(model, PHYSICAL_MODEL_KEYS, "physical model");
  assertNoForbiddenKeys(model, "physical_model");

  const tables = requireArray(model.tables, "tables").map((table, tableIndex) => {
    requireObject(table, `tables[${tableIndex}]`);
    requireExactKeys(table, LEGACY_TABLE_KEYS, `tables[${tableIndex}]`);
    const columns = requireArray(
      table.columns,
      `tables[${tableIndex}].columns`,
    ).map((column, columnIndex) => {
      requireObject(
        column,
        `tables[${tableIndex}].columns[${columnIndex}]`,
      );
      requireExactKeys(
        column,
        COLUMN_KEYS,
        `tables[${tableIndex}].columns[${columnIndex}]`,
      );
      requireObject(
        column.data_type,
        `tables[${tableIndex}].columns[${columnIndex}].data_type`,
      );
      requireExactKeys(
        column.data_type,
        LEGACY_DATA_TYPE_KEYS,
        `tables[${tableIndex}].columns[${columnIndex}].data_type`,
      );
      return {
        ...column,
        data_type: {
          ...column.data_type,
          vector_element_type: null,
          vector_dimension: null,
        },
      };
    });
    return {
      ...table,
      columns,
      check_constraints: [],
    };
  });

  return {
    ...model,
    model_version: MODEL_VERSION,
    tables,
  };
}

function validatePhysicalModel(model) {
  requireObject(model, "physical_model");
  const modelVersion = requireNonblankString(
    model.model_version,
    "model_version",
  );
  if (modelVersion === LEGACY_MODEL_VERSION) {
    return validatePhysicalModelV2(migratePhysicalModelV1ToV2(model));
  }
  if (modelVersion === MODEL_VERSION) {
    return validatePhysicalModelV2(model);
  }
  fail(
    `Unsupported model_version ${JSON.stringify(modelVersion)}; expected "1" or "2"`,
  );
}

function reconstructDrawdbPhysicalModel(document) {
  // Route the editor representation through the ordinary diagram adapter.  Do
  // not derive a partial/count-only projection here: the adapter's complete
  // physical model is the value reconciled against the authoritative model.
  const reconstructedProject = diagramToCanonicalProject(document);
  return validatePhysicalModel(reconstructedProject.physical_model);
}

function physicalModelsMatch(authoritativeModel, editorModel) {
  // Both values have passed exact v2 validation, so deterministic JSON
  // equality compares every canonical semantic field (including ordered
  // columns, key columns, relationships, and table CHECK constraints).
  return JSON.stringify(authoritativeModel) === JSON.stringify(editorModel);
}

export function canonicalProjectToDiagram(project) {
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
  if (project.project_version !== PROJECT_VERSION) {
    fail(
      `Unsupported project_version ${JSON.stringify(project.project_version)}; expected "1"`,
    );
  }

  const model = validatePhysicalModel(project.physical_model);
  const tableIds = new Set(model.tables.map((t) => t.id));
  const layout = parseDiagramLayout(project.diagram_layout, tableIds);
  if (project.drawdb_document !== undefined) {
    const editorDocument = validateDrawdbDocument(project.drawdb_document);
    const editorModel = reconstructDrawdbPhysicalModel(editorDocument);
    if (!physicalModelsMatch(model, editorModel)) {
      failWithCode(
        CANONICAL_EDITOR_SEMANTIC_MISMATCH_ERROR_CODE,
        CANONICAL_EDITOR_SEMANTIC_MISMATCH_ERROR_MESSAGE,
      );
    }
    return editorDocument;
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
      checkConstraints: (table.check_constraints || []).map((check) => ({
        id: check.id,
        name: check.name,
        expression: check.expression,
        validation: check.validation,
        nameOrigin: check.name_origin,
      })),
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

  return {
    title: model.name,
    tables,
    relationships,
    transform: {
      pan: { x: layout.viewport.x, y: layout.viewport.y },
      zoom: layout.viewport.zoom,
    },
  };
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
  if (database === undefined || database === "snowflake") {
    rejectLegacyFieldChecks(tables);
  }

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
      });
    }

    const checkConstraintIds = new Set();
    const checks = (table.checkConstraints || []).map((check, cIndex) => {
      const id =
        check.id !== undefined && check.id !== null && String(check.id).trim()
          ? String(check.id)
          : `check-${cIndex + 1}`;
      if (checkConstraintIds.has(id)) {
        fail(
          `duplicate check constraint id ${JSON.stringify(id)} in table ${JSON.stringify(table.name)}`,
        );
      }
      checkConstraintIds.add(id);
      return {
        id,
        name: check.name ?? null,
        expression: check.expression,
        validation: check.validation,
        name_origin: check.nameOrigin,
      };
    });

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
      check_constraints: sortById(checks),
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
      check_constraints: table.check_constraints,
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
  validatePhysicalModel(physical_model);

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
  if (
    column.data_type.family === "VECTOR" &&
    (column.data_type.vector_element_type === null ||
      column.data_type.vector_dimension === null)
  ) {
    failWithCode(UNRESOLVED_VECTOR_ERROR_CODE, UNRESOLVED_VECTOR_ERROR_MESSAGE);
  }
  const parts = [column.name, column.data_type.text];
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

function renderCheckConstraint(check) {
  if (check.name !== null) {
    return `CONSTRAINT ${check.name} CHECK (${check.expression})`;
  }
  return `CHECK (${check.expression})`;
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
  let inString = false;
  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    current += char;
    if (inString) {
      if (char === "'" && sql[index + 1] === "'") {
        current += sql[index + 1];
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
      if (depth < 0) fail("unsupported Snowflake DDL: unbalanced parentheses");
    } else if (char === ";" && depth === 0) {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }
  if (inString || depth !== 0) {
    fail("unsupported Snowflake DDL: unterminated string or parentheses");
  }
  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

function splitSnowflakeTopLevelList(text) {
  const parts = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      current += char;
      if (char === "'" && text[index + 1] === "'") {
        current += text[index + 1];
        index += 1;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
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
  if (inString || depth !== 0) {
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

function parseSnowflakeDataType(value, options = {}) {
  try {
    return canonicalizeSnowflakeType(value, options);
  } catch (err) {
    if (/unsupported Snowflake data type/i.test(err.message)) {
      fail(`unsupported type family ${value}`);
    }
    throw err;
  }
}

function scanSnowflakeCheckExpression(text, checkKeywordIndex) {
  const openParenIndex = text.indexOf("(", checkKeywordIndex);
  if (openParenIndex === -1) {
    fail("unsupported Snowflake CHECK constraint: missing opening parenthesis");
  }
  let depth = 1;
  let inString = false;
  let i = openParenIndex + 1;
  while (i < text.length) {
    const char = text[i];
    if (inString) {
      if (char === "'" && text[i + 1] === "'") {
        i += 2;
        continue;
      }
      if (char === "'") {
        inString = false;
      }
    } else {
      if (char === "'") {
        inString = true;
      } else if (char === "(") {
        depth += 1;
      } else if (char === ")") {
        depth -= 1;
        if (depth === 0) {
          const rawExpr = text.slice(openParenIndex + 1, i);
          const expr = rawExpr.trim();
          if (!expr) {
            fail("CHECK constraint expression must not be empty");
          }
          return {
            expression: expr,
            endIndex: i + 1,
          };
        }
      }
    }
    i += 1;
  }
  fail(
    "unsupported Snowflake CHECK constraint: unterminated parentheses or string literal",
  );
}

function isSnowflakeWordBoundary(value, index) {
  return index < 0 || index >= value.length || !/[A-Z0-9_$]/i.test(value[index]);
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
  const checkMatch = remaining.match(/^CHECK\s*\(/i);
  if (checkMatch && isSnowflakeWordBoundary(rest, index - 1)) {
    const scanResult = scanSnowflakeCheckExpression(rest, index);
    return {
      kind: "CHECK",
      start: index,
      end: scanResult.endIndex,
      expression: scanResult.expression,
    };
  }
  return null;
}

function snowflakeColumnClauseStarts(rest) {
  const clauses = [];
  let depth = 0;
  let inString = false;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    if (inString) {
      if (char === "'" && rest[index + 1] === "'") {
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
      if (depth < 0) fail("unsupported Snowflake column clause: unbalanced parentheses");
    } else if (depth === 0) {
      const clause = readSnowflakeColumnClause(rest, index);
      if (clause) {
        clauses.push(clause);
        index = clause.end - 1;
      }
    }
  }
  if (inString || depth !== 0) {
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
  let inString = false;
  for (let index = 0; index < rest.length; index += 1) {
    const char = rest[index];
    if (inString) {
      if (char === "'" && rest[index + 1] === "'") {
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
  let checkConstraint = null;
  const clauses = snowflakeColumnClauseStarts(rest);
  if (clauses.length === 0) {
    if (rest.trim()) {
      fail(`unsupported Snowflake column clause on ${columnName}: ${rest.trim()}`);
    }
    return { nullable, defaultValue, comment, checkConstraint };
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
      if (checkConstraint !== null) {
        fail(`duplicate CHECK clause on ${columnName}`);
      }
      if (value) {
        fail(`unsupported Snowflake column clause on ${columnName}: ${value}`);
      }
      checkConstraint = { expression: clause.expression };
    }
  });
  return { nullable, defaultValue, comment, checkConstraint };
}

function splitSnowflakeColumnTypeAndRest(afterName) {
  let depth = 0;
  for (let i = 0; i < afterName.length; i += 1) {
    const char = afterName[i];
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
    } else if (depth === 0) {
      const remaining = afterName.slice(i);
      if (
        /^(?:NOT\s+NULL|DEFAULT|COMMENT|PRIMARY|UNIQUE|REFERENCES|CHECK|COLLATE|IDENTITY|AUTOINCREMENT)\b/i.test(
          remaining,
        ) &&
        isSnowflakeWordBoundary(afterName, i - 1)
      ) {
        return {
          rawType: afterName.slice(0, i).trim(),
          rawRest: afterName.slice(i),
        };
      }
    }
  }
  return {
    rawType: afterName.trim(),
    rawRest: "",
  };
}

function parseSnowflakeColumnDefinition(
  definition,
  tableParts,
  ordinal,
  options = {},
) {
  const nameMatch = definition.match(/^([A-Z_][A-Z0-9_$]*)\s+([\s\S]+)$/i);
  if (!nameMatch) {
    fail(`unsupported Snowflake column definition ${JSON.stringify(definition)}`);
  }
  const [, rawName, afterName] = nameMatch;
  const { rawType, rawRest } = splitSnowflakeColumnTypeAndRest(afterName);
  const name = parseSnowflakeIdentifier(rawName, "column");
  if (unsupportedSnowflakeColumnFeature(rawRest)) {
    fail(`unsupported Snowflake column feature on ${name}`);
  }
  const { nullable, defaultValue, comment, checkConstraint } =
    parseSnowflakeColumnClauses(rawRest.trim(), name);

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
    checkConstraint,
  };
}

function parseSnowflakeInlineConstraint(definition, tableParts, columnsByName) {
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
  };
}

function parseSnowflakeCreateTable(statement, options = {}) {
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
  const checkConstraints = [];
  let unnamedCheckCount = 0;
  const columnsByName = new Map();
  splitSnowflakeTopLevelList(body).forEach((definition) => {
    const trimmedDef = definition.trim();
    const namedCheckMatch = trimmedDef.match(
      /^CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+CHECK\s*\(/i,
    );
    if (namedCheckMatch) {
      const [, rawConstraintName] = namedCheckMatch;
      const constraintName = parseSnowflakeIdentifier(
        rawConstraintName,
        "constraint",
      );
      const afterConstraintName =
        trimmedDef.toUpperCase().indexOf(rawConstraintName.toUpperCase()) +
        rawConstraintName.length;
      const checkKeywordIndex = trimmedDef
        .toUpperCase()
        .indexOf("CHECK", afterConstraintName);
      const scanResult = scanSnowflakeCheckExpression(
        trimmedDef,
        checkKeywordIndex,
      );
      const remainder = trimmedDef.slice(scanResult.endIndex).trim();
      if (remainder) {
        fail(`unsupported Snowflake CHECK constraint: unexpected ${remainder}`);
      }
      checkConstraints.push({
        id: constraintId(catalog, schema, name, constraintName),
        name: constraintName,
        expression: scanResult.expression,
        validation: "VALIDATE",
        name_origin: "explicit",
      });
      return;
    }
    if (/^CHECK\s*\(/i.test(trimmedDef)) {
      const scanResult = scanSnowflakeCheckExpression(trimmedDef, 0);
      const remainder = trimmedDef.slice(scanResult.endIndex).trim();
      if (remainder) {
        fail(`unsupported Snowflake CHECK constraint: unexpected ${remainder}`);
      }
      unnamedCheckCount += 1;
      checkConstraints.push({
        id: `check:${catalog}.${schema}.${name}#${unnamedCheckCount}`,
        name: null,
        expression: scanResult.expression,
        validation: "VALIDATE",
        name_origin: "unnamed",
      });
      return;
    }
    if (/^CONSTRAINT\s+/i.test(definition)) {
      constraints.push(
        parseSnowflakeInlineConstraint(definition, tableParts, columnsByName),
      );
      return;
    }
    const { column, checkConstraint } = parseSnowflakeColumnDefinition(
      definition,
      tableParts,
      columns.length + 1,
      options,
    );
    if (columnsByName.has(column.name)) {
      fail(`duplicate column ${column.name} in ${name}`);
    }
    columnsByName.set(column.name, column);
    columns.push(column);
    if (checkConstraint) {
      unnamedCheckCount += 1;
      checkConstraints.push({
        id: `check:${catalog}.${schema}.${name}#${unnamedCheckCount}`,
        name: null,
        expression: checkConstraint.expression,
        validation: "VALIDATE",
        name_origin: "unnamed",
      });
    }
  });
  if (columns.length === 0) fail(`table ${name} must have columns`);
  return {
    namespace: { id: namespaceId(catalog, schema), catalog, schema },
    table: {
      id: tableId(catalog, schema, name),
      namespace_id: namespaceId(catalog, schema),
      name,
      kind: "table",
      columns,
      constraints,
      check_constraints: sortById(checkConstraints),
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
  if (/"|`|\[/u.test(sql)) {
    fail("unsupported Snowflake DDL: quoted identifiers are not imported");
  }
  const namespaceById = new Map();
  const tableByName = new Map();
  const tables = [];
  for (const statement of splitSnowflakeStatements(sql)) {
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
      const { namespace, table } = parseSnowflakeCreateTable(statement, options);
      namespaceById.set(namespace.id, namespace);
      if (tableByName.has(`${namespace.catalog}.${namespace.schema}.${table.name}`)) {
        fail(`duplicate table ${namespace.catalog}.${namespace.schema}.${table.name}`);
      }
      tableByName.set(`${namespace.catalog}.${namespace.schema}.${table.name}`, table);
      tables.push(table);
    } else if (/^ALTER\s+TABLE\s+/i.test(statement)) {
      const checkAlterMatch = statement.match(
        /^ALTER\s+TABLE\s+([A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*\.[A-Z_][A-Z0-9_$]*)\s+ADD\s+(?:CONSTRAINT\s+([A-Z_][A-Z0-9_$]*)\s+)?CHECK\s*\(/i,
      );
      if (checkAlterMatch) {
        const [, rawTable, rawConstraintName] = checkAlterMatch;
        const [catalog, schema, tableName] = parseQualifiedSnowflakeName(
          rawTable,
          3,
          "table",
        );
        const sourceTable = tableByName.get(`${catalog}.${schema}.${tableName}`);
        if (!sourceTable) {
          fail(`ALTER TABLE references unknown table ${rawTable}`);
        }
        const addIndex = statement.toUpperCase().indexOf("ADD");
        let checkIndex;
        if (rawConstraintName) {
          const afterConstraint =
            statement.toUpperCase().indexOf(rawConstraintName.toUpperCase(), addIndex) +
            rawConstraintName.length;
          checkIndex = statement.toUpperCase().indexOf("CHECK", afterConstraint);
        } else {
          checkIndex = statement.toUpperCase().indexOf("CHECK", addIndex);
        }
        const scanResult = scanSnowflakeCheckExpression(statement, checkIndex);
        const remainder = statement.slice(scanResult.endIndex).trim();
        if (remainder) {
          fail(
            `unsupported Snowflake ALTER TABLE statement: unexpected ${remainder}`,
          );
        }
        if (rawConstraintName) {
          const name = parseSnowflakeIdentifier(rawConstraintName, "constraint");
          sourceTable.check_constraints.push({
            id: constraintId(catalog, schema, tableName, name),
            name,
            expression: scanResult.expression,
            validation: "VALIDATE",
            name_origin: "explicit",
          });
        } else {
          const unnamedCount =
            sourceTable.check_constraints.filter((c) => c.name === null).length + 1;
          sourceTable.check_constraints.push({
            id: `check:${catalog}.${schema}.${tableName}#${unnamedCount}`,
            name: null,
            expression: scanResult.expression,
            validation: "VALIDATE",
            name_origin: "unnamed",
          });
        }
      } else {
        const { sourceTable, constraint } = parseSnowflakeForeignKeyAlter(
          statement,
          tableByName,
        );
        sourceTable.constraints.push(constraint);
      }
    } else {
      fail(`unsupported Snowflake DDL statement: ${statement.slice(0, 60)}`);
    }
  }
  const namespaces = sortById([...namespaceById.values()]);
  const canonicalTables = sortById(
    tables.map((table) => ({
      ...table,
      constraints: sortById(table.constraints),
      check_constraints: sortById(table.check_constraints),
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

export function renderCanonicalSnowflakeDDL(projectOrModel) {
  let model;
  if (
    isPlainObject(projectOrModel) &&
    "physical_model" in projectOrModel &&
    "project_version" in projectOrModel
  ) {
    model = validatePhysicalModel(projectOrModel.physical_model);
  } else {
    model = validatePhysicalModel(projectOrModel);
  }

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
      ...(table.check_constraints || []).map(
        (check) => `    ${renderCheckConstraint(check)}`,
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

export function renderCanonicalSnowflakeStatements(
  projectOrModel,
  options = {},
) {
  let model;
  if (
    isPlainObject(projectOrModel) &&
    "physical_model" in projectOrModel &&
    "project_version" in projectOrModel
  ) {
    model = validatePhysicalModel(projectOrModel.physical_model);
  } else {
    model = validatePhysicalModel(projectOrModel);
  }

  const { databaseOverride, schemaOverride, replace = false } = options;
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
      ...(table.check_constraints || []).map(
        (check) => `    ${renderCheckConstraint(check)}`,
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
    statements.push(lines.join("\n"));
  });

  const fkAlters = foreignKeyAlterStatements(model, ddlTables);
  statements.push(...fkAlters);

  return statements;
}
