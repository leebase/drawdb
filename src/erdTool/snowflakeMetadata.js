import {
  canonicalProjectToDiagram,
  SnowflakeCheckError,
  validateSnowflakeCheckExpression,
} from "./projectAdapter.js";
import { canonicalizeSnowflakeType } from "./snowflakeTypeContract.js";

const PROJECT_VERSION = "2";
const MODEL_VERSION = "2";
const FALLBACK_X_STEP = 280;
const FALLBACK_Y = 80;
const IDENTIFIER_RE = /^[A-Z_][A-Z0-9_$]*$/;
const CONSTRAINT_KIND = new Map([
  ["PRIMARY KEY", "primary_key"],
  ["UNIQUE", "unique"],
  ["FOREIGN KEY", "foreign_key"],
]);

function fail(message) {
  throw new Error(message);
}

function checkFailure(code, message) {
  throw new SnowflakeCheckError(
    code,
    String(message || "Snowflake CHECK metadata is invalid"),
  );
}

function checkErrorOrInvalid(error) {
  if (error instanceof SnowflakeCheckError) throw error;
  checkFailure("SNOWFLAKE_CHECK_INVALID", error?.message);
}

function checkIdentifier(value, label) {
  try {
    return identifier(value, label);
  } catch (error) {
    checkErrorOrInvalid(error);
  }
}

function validatedCheckExpression(value, label) {
  if (typeof value !== "string") {
    checkFailure("SNOWFLAKE_CHECK_INVALID", `${label} must be a string`);
  }
  if (!value.trim()) {
    checkFailure("SNOWFLAKE_CHECK_INVALID", `${label} must be nonblank`);
  }
  try {
    return validateSnowflakeCheckExpression(value);
  } catch (error) {
    checkErrorOrInvalid(error);
  }
}

function rows(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  return value;
}

function metadataObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("metadata must be an object");
  }
  return value;
}

function identifier(value, label) {
  if (typeof value !== "string" || !IDENTIFIER_RE.test(value)) {
    fail(`${label} must be an uppercase unquoted Snowflake identifier`);
  }
  return value;
}

function optionalString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadataValue(row, ...names) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return undefined;
  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  const key = Object.keys(row).find((candidate) =>
    wanted.has(candidate.toLowerCase()),
  );
  return key === undefined ? undefined : row[key];
}

function integerOrNull(value, label) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  fail(`${label} must be an integer`);
}

function positiveIntegerOrNull(value, label) {
  const integer = integerOrNull(value, label);
  if (integer !== null && integer < 1) {
    fail(`${label} must be a positive integer`);
  }
  return integer;
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

function objectKey(catalog, schema, tableName) {
  return `${catalog}\0${schema}\0${tableName}`;
}

function constraintKey(catalog, schema, constraintName) {
  return `${catalog}\0${schema}\0${constraintName}`;
}

function namespaceParts(namespaceObjectId) {
  const match = String(namespaceObjectId).match(
    /^namespace:([A-Z_][A-Z0-9_$]*)\.([A-Z_][A-Z0-9_$]*)$/,
  );
  if (!match) fail(`invalid namespace id ${JSON.stringify(namespaceObjectId)}`);
  return { catalog: match[1], schema: match[2] };
}

function typeLabel(column) {
  return `column ${column.table_catalog ?? "?"}.${column.table_schema ?? "?"}.${column.table_name ?? "?"}.${column.column_name ?? "?"}`;
}

/**
 * FIXED is emitted by some Snowflake driver/SHOW metadata paths.  It is
 * intentionally handled here, at the metadata boundary only; it is not a
 * user-facing alias in the shared DDL contract.
 */
function metadataTypeToken(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    fail(`${label} must be a nonblank Snowflake data type`);
  }
  const token = value.trim();
  return token.toUpperCase() === "FIXED" ? "NUMBER" : token;
}

function metadataParameters(column, label) {
  return {
    numericPrecision: integerOrNull(
      column.numeric_precision,
      `${label}.numeric_precision`,
    ),
    numericScale: integerOrNull(
      column.numeric_scale,
      `${label}.numeric_scale`,
    ),
    characterLength: integerOrNull(
      column.character_maximum_length,
      `${label}.character_maximum_length`,
    ),
    datetimePrecision: integerOrNull(
      column.datetime_precision,
      `${label}.datetime_precision`,
    ),
  };
}

function assertMetadataParameters(canonical, parameters, label) {
  const { family } = canonical;
  const {
    numericPrecision,
    numericScale,
    characterLength,
    datetimePrecision,
  } = parameters;

  const usesNumber = family === "NUMBER";
  const usesLength = family === "VARCHAR" || family === "BINARY";
  const usesPrecision =
    family === "TIME" ||
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ";

  if (usesNumber) {
    if (characterLength !== null || datetimePrecision !== null) {
      fail(`${label} has contradictory NUMBER metadata parameters`);
    }
  } else if (usesLength) {
    if (numericPrecision !== null || numericScale !== null || datetimePrecision !== null) {
      fail(`${label} has contradictory ${family} metadata parameters`);
    }
  } else if (usesPrecision) {
    if (numericScale !== null || characterLength !== null) {
      fail(`${label} has contradictory ${family} metadata parameters`);
    }
    if (
      numericPrecision !== null &&
      datetimePrecision !== null &&
      numericPrecision !== datetimePrecision
    ) {
      fail(`${label} has contradictory ${family} precision metadata`);
    }
  } else if (
    numericPrecision !== null ||
    numericScale !== null ||
    characterLength !== null ||
    datetimePrecision !== null
  ) {
    fail(`${label} has contradictory ${family} metadata parameters`);
  }

  if (usesNumber) {
    if (numericPrecision === null && numericScale !== null) {
      fail(`${label} has numeric_scale without numeric_precision`);
    }
    if (
      (numericPrecision !== null && numericPrecision !== canonical.precision) ||
      (numericScale !== null && numericScale !== canonical.scale)
    ) {
      fail(`${label} has contradictory NUMBER metadata parameters`);
    }
  } else if (
    usesLength &&
    characterLength !== null &&
    characterLength !== canonical.length
  ) {
    fail(`${label} has contradictory ${family} metadata parameters`);
  } else if (usesPrecision) {
    const precision = datetimePrecision ?? numericPrecision;
    if (precision !== null && precision !== canonical.precision) {
      fail(`${label} has contradictory ${family} precision metadata`);
    }
  }
}

function typeWithMetadataParameters(column, token, options, label) {
  const probe = canonicalizeSnowflakeType(token, {
    ...options,
    allowIncompleteVector: true,
    label,
  });
  const family = probe.family;
  const usesNumber = family === "NUMBER";
  const usesLength = family === "VARCHAR" || family === "BINARY";
  const usesPrecision =
    family === "TIME" ||
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ";
  const parameters = metadataParameters(column, label);
  const {
    numericPrecision,
    numericScale,
    characterLength,
    datetimePrecision,
  } = parameters;

  let expression = token;
  if (usesNumber) {
    if (numericPrecision !== null) {
      expression =
        numericScale === null
          ? `${token}(${numericPrecision})`
          : `${token}(${numericPrecision}, ${numericScale})`;
    }
  } else if (usesLength && characterLength !== null) {
    expression = `${token}(${characterLength})`;
  } else if (usesPrecision) {
    const precision = datetimePrecision ?? numericPrecision;
    if (precision !== null) expression = `${token}(${precision})`;
  }

  const canonical = canonicalizeSnowflakeType(expression, {
    ...options,
    allowIncompleteVector: true,
    label,
  });
  assertMetadataParameters(canonical, parameters, label);
  return canonical;
}

function describeTypeRows(metadata) {
  const keys = [
    "describeRows",
    "vectorDescribeRows",
    "describeTableRows",
    "describeTables",
  ].filter((key) => Object.prototype.hasOwnProperty.call(metadata, key));
  if (keys.length > 1) {
    fail(`metadata contains conflicting DESCRIBE TABLE collections: ${keys.join(", ")}`);
  }
  return keys.length === 0 ? undefined : metadata[keys[0]];
}

function describeTableIdentity(value, label, fallbackKey = null) {
  const catalog = metadataValue(value, "table_catalog", "catalog_name", "catalog");
  const schema = metadataValue(value, "table_schema", "schema_name", "schema");
  const table = metadataValue(value, "table_name", "table");
  if (catalog !== undefined && schema !== undefined && table !== undefined) {
    return {
      catalog: identifier(catalog, `${label}.table_catalog`),
      schema: identifier(schema, `${label}.table_schema`),
      table: identifier(table, `${label}.table_name`),
    };
  }
  if (fallbackKey !== null) {
    const key = String(fallbackKey);
    const parts = key.includes("\0") ? key.split("\0") : key.split(".");
    if (parts.length === 3) {
      return {
        catalog: identifier(parts[0], `${label}.table_catalog`),
        schema: identifier(parts[1], `${label}.table_schema`),
        table: identifier(parts[2], `${label}.table_name`),
      };
    }
  }
  fail(`${label} is missing DESCRIBE TABLE catalog, schema, and table identity`);
}

function addDescribeTableRows(index, identity, value, label) {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  const key = objectKey(identity.catalog, identity.schema, identity.table);
  if (!index.has(key)) index.set(key, new Map());
  const byColumn = index.get(key);
  for (const [rowIndex, row] of value.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      fail(`${label}[${rowIndex}] must be an object`);
    }
    const name = metadataValue(row, "name", "column_name", "column");
    const type = metadataValue(row, "type", "data_type", "datatype");
    if (typeof name !== "string" || !name.trim()) {
      fail(`${label}[${rowIndex}] is missing a column name`);
    }
    if (typeof type !== "string" || !type.trim()) {
      fail(`${label}[${rowIndex}] is missing a column type`);
    }
    const columnName = identifier(name.trim(), `${label}[${rowIndex}].name`);
    if (byColumn.has(columnName)) {
      fail(`duplicate DESCRIBE TABLE row for ${identity.catalog}.${identity.schema}.${identity.table}.${columnName}`);
    }
    byColumn.set(columnName, { name: columnName, type: type.trim() });
  }
}

function buildDescribeTypeIndex(metadata, expectedVectorColumns) {
  const source = describeTypeRows(metadata);
  const index = new Map();
  if (source === undefined) return index;

  const addEntry = (entry, label, fallbackKey = null) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`${label} must be an object`);
    }
    const nestedRows = metadataValue(entry, "rows", "columns", "describe_rows");
    if (Array.isArray(nestedRows)) {
      const identity = describeTableIdentity(entry, label, fallbackKey);
      addDescribeTableRows(index, identity, nestedRows, `${label}.rows`);
      return;
    }
    const identity = describeTableIdentity(entry, label, fallbackKey);
    addDescribeTableRows(index, identity, [entry], label);
  };

  if (Array.isArray(source)) {
    for (const [indexValue, entry] of source.entries()) {
      addEntry(entry, `metadata.describeRows[${indexValue}]`);
    }
  } else if (source && typeof source === "object") {
    for (const [key, value] of Object.entries(source)) {
      if (Array.isArray(value)) {
        const identity = describeTableIdentity(value[0] ?? {}, `metadata.describeRows.${key}`, key);
        addDescribeTableRows(index, identity, value, `metadata.describeRows.${key}`);
      } else {
        addEntry(value, `metadata.describeRows.${key}`, key);
      }
    }
  } else {
    fail("metadata DESCRIBE TABLE collection must be an array or object");
  }

  // A DESCRIBE row that claims to be VECTOR must correspond to a VECTOR in
  // COLUMNS.  This catches stale or contradictory driver responses before the
  // row can become canonical data.
  for (const [tableKey, byColumn] of index) {
    const expected = expectedVectorColumns.get(tableKey) ?? new Map();
    for (const [columnName, row] of byColumn) {
      if (!/^VECTOR(?:\s*\(|\s*$)/i.test(row.type)) continue;
      let described;
      try {
        described = canonicalizeSnowflakeType(row.type, {
          allowIncompleteVector: true,
          label: `DESCRIBE TABLE ${tableKey}.${columnName}`,
        });
      } catch (error) {
        fail(`malformed DESCRIBE TABLE VECTOR row for ${tableKey}.${columnName}: ${error.message}`);
      }
      if (!expected.has(columnName)) {
        fail(`contradictory DESCRIBE TABLE VECTOR row for ${tableKey}.${columnName}`);
      }
      if (
        described.family !== "VECTOR" ||
        described.element_type === null ||
        described.dimension === null
      ) {
        fail(`DESCRIBE TABLE VECTOR row for ${tableKey}.${columnName} is incomplete`);
      }
    }
  }
  return index;
}

function expectedVectorColumnIndex(metadata, tableRows, options) {
  const expected = new Map();
  const selectedTables = new Set(
    tableRows.map((table) =>
      objectKey(
        identifier(table.table_catalog, "table.table_catalog"),
        identifier(table.table_schema, "table.table_schema"),
        identifier(table.table_name, "table.table_name"),
      ),
    ),
  );
  for (const [rowIndex, column] of rows(metadata.columns, "columns").entries()) {
    const catalog = identifier(column.table_catalog, `column[${rowIndex}].table_catalog`);
    const schema = identifier(column.table_schema, `column[${rowIndex}].table_schema`);
    const table = identifier(column.table_name, `column[${rowIndex}].table_name`);
    const tableKey = objectKey(catalog, schema, table);
    if (!selectedTables.has(tableKey)) continue;
    const label = typeLabel(column);
    const token = metadataTypeToken(column.data_type, `${label}.data_type`);
    const probe = canonicalizeSnowflakeType(token, {
      ...options,
      allowIncompleteVector: true,
      label,
    });
    if (probe.family !== "VECTOR") continue;
    const columnName = identifier(column.column_name, `${label}.column_name`);
    if (!expected.has(tableKey)) expected.set(tableKey, new Map());
    if (expected.get(tableKey).has(columnName)) {
      fail(`duplicate VECTOR column metadata for ${tableKey}.${columnName}`);
    }
    expected.get(tableKey).set(columnName, probe);
  }
  return expected;
}

function canonicalDataType(column, describeIndex, options = {}) {
  const label = typeLabel(column);
  const token = metadataTypeToken(column.data_type, `${label}.data_type`);
  const probe = canonicalizeSnowflakeType(token, {
    ...options,
    allowIncompleteVector: true,
    label,
  });
  const family = probe.family;

  let canonical = probe;
  if (!/[()]/.test(token)) {
    canonical = typeWithMetadataParameters(column, token, options, label);
  } else {
    assertMetadataParameters(
      canonical,
      metadataParameters(column, label),
      label,
    );
  }

  if (family !== "VECTOR") return canonical;

  const catalog = identifier(column.table_catalog, `${label}.table_catalog`);
  const schema = identifier(column.table_schema, `${label}.table_schema`);
  const table = identifier(column.table_name, `${label}.table_name`);
  const columnName = identifier(column.column_name, `${label}.column_name`);
  const tableKey = objectKey(catalog, schema, table);
  const described = describeIndex.get(tableKey)?.get(columnName);
  if (!described) {
    if (canonical.element_type !== null && canonical.dimension !== null) {
      return canonical;
    }
    fail(`VECTOR column ${tableKey}.${columnName} is missing its DESCRIBE TABLE signature`);
  }

  let describedCanonical;
  try {
    describedCanonical = canonicalizeSnowflakeType(described.type, {
      ...options,
      allowIncompleteVector: true,
      label: `DESCRIBE TABLE ${tableKey}.${columnName}`,
    });
  } catch (error) {
    fail(`malformed DESCRIBE TABLE row for ${tableKey}.${columnName}: ${error.message}`);
  }
  if (
    describedCanonical.family !== "VECTOR" ||
    describedCanonical.element_type === null ||
    describedCanonical.dimension === null
  ) {
    fail(`contradictory DESCRIBE TABLE row for ${tableKey}.${columnName}; expected a complete VECTOR signature`);
  }
  if (
    canonical.element_type !== null &&
    (canonical.element_type !== describedCanonical.element_type ||
      canonical.dimension !== describedCanonical.dimension)
  ) {
    fail(`contradictory VECTOR metadata for ${tableKey}.${columnName}`);
  }
  return describedCanonical;
}

function buildNamespaces(metadata, tableRows) {
  const namespaces = new Map();
  for (const schema of rows(metadata.schemata, "schemata")) {
    const catalog = identifier(schema.catalog_name, "schema.catalog_name");
    const name = identifier(schema.schema_name, "schema.schema_name");
    namespaces.set(namespaceId(catalog, name), {
      id: namespaceId(catalog, name),
      catalog,
      schema: name,
    });
  }
  for (const table of tableRows) {
    const catalog = identifier(table.table_catalog, "table.table_catalog");
    const schema = identifier(table.table_schema, "table.table_schema");
    const id = namespaceId(catalog, schema);
    if (!namespaces.has(id)) namespaces.set(id, { id, catalog, schema });
  }
  return sortById([...namespaces.values()]);
}

function checkConstraintKey(catalog, schema, tableName, constraintName) {
  return `${catalog}\0${schema}\0${tableName}\0${constraintName}`;
}

function buildMetadataTableKinds(metadata) {
  const tableKinds = new Map();
  for (const [rowIndex, row] of rows(metadata.tables, "tables").entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      checkFailure("SNOWFLAKE_CHECK_INVALID", `tables[${rowIndex}] must be an object`);
    }
    const catalog = checkIdentifier(
      metadataValue(row, "table_catalog"),
      `tables[${rowIndex}].table_catalog`,
    );
    const schema = checkIdentifier(
      metadataValue(row, "table_schema"),
      `tables[${rowIndex}].table_schema`,
    );
    const tableName = checkIdentifier(
      metadataValue(row, "table_name"),
      `tables[${rowIndex}].table_name`,
    );
    const key = objectKey(catalog, schema, tableName);
    const kind = String(metadataValue(row, "table_type") ?? "")
      .trim()
      .toUpperCase();
    if (!kind) {
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `tables[${rowIndex}].table_type must be nonblank`,
      );
    }
    const previous = tableKinds.get(key);
    if (previous !== undefined && previous !== kind) {
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `conflicting table types for ${catalog}.${schema}.${tableName}`,
      );
    }
    tableKinds.set(key, kind);
  }
  return tableKinds;
}

function requireSelectedCheckTable(
  tableKey,
  tableKinds,
  selectedTables,
  catalog,
  schema,
  tableName,
) {
  const kind = tableKinds.get(tableKey);
  if (kind === undefined) {
    checkFailure(
      "SNOWFLAKE_CHECK_LOSS",
      `CHECK constraint ${catalog}.${schema}.${tableName} is not attached to a selected base table`,
    );
  }
  if (kind !== undefined && kind !== "BASE TABLE") {
    checkFailure(
      "SNOWFLAKE_CHECK_UNSUPPORTED",
      `CHECK constraint on unsupported Snowflake table type ${kind}: ${catalog}.${schema}.${tableName}`,
    );
  }
  if (selectedTables.has(tableKey)) return;
  checkFailure(
    "SNOWFLAKE_CHECK_LOSS",
    `CHECK constraint ${catalog}.${schema}.${tableName} is not attached to a selected base table`,
  );
}

function tableConstraintCheckIdentity(row, label) {
  const tableCatalog = checkIdentifier(
    metadataValue(row, "table_catalog"),
    `${label}.table_catalog`,
  );
  const tableSchema = checkIdentifier(
    metadataValue(row, "table_schema"),
    `${label}.table_schema`,
  );
  const tableName = checkIdentifier(
    metadataValue(row, "table_name"),
    `${label}.table_name`,
  );
  const constraintCatalog = checkIdentifier(
    metadataValue(row, "constraint_catalog"),
    `${label}.constraint_catalog`,
  );
  const constraintSchema = checkIdentifier(
    metadataValue(row, "constraint_schema"),
    `${label}.constraint_schema`,
  );
  const constraintName = checkIdentifier(
    metadataValue(row, "constraint_name"),
    `${label}.constraint_name`,
  );
  if (
    tableCatalog !== constraintCatalog ||
    tableSchema !== constraintSchema
  ) {
    checkFailure(
      "SNOWFLAKE_CHECK_INVALID",
      `${label} has conflicting table and constraint namespace identity`,
    );
  }
  return {
    catalog: constraintCatalog,
    schema: constraintSchema,
    tableName,
    name: constraintName,
    tableKey: objectKey(tableCatalog, tableSchema, tableName),
    key: checkConstraintKey(
      constraintCatalog,
      constraintSchema,
      tableName,
      constraintName,
    ),
  };
}

function checkConstraintRowIdentity(row, label) {
  const catalog = checkIdentifier(
    metadataValue(row, "constraint_catalog"),
    `${label}.constraint_catalog`,
  );
  const schema = checkIdentifier(
    metadataValue(row, "constraint_schema"),
    `${label}.constraint_schema`,
  );
  // CHECK_CONSTRAINTS calls this column CONSTRAINT_TABLE.  Do not fall back to
  // TABLE_NAME: accepting the wrong transport shape can silently join a check
  // from another table.
  const tableName = checkIdentifier(
    metadataValue(row, "constraint_table"),
    `${label}.constraint_table`,
  );
  const name = checkIdentifier(
    metadataValue(row, "constraint_name"),
    `${label}.constraint_name`,
  );
  return {
    catalog,
    schema,
    tableName,
    name,
    tableKey: objectKey(catalog, schema, tableName),
    key: checkConstraintKey(catalog, schema, tableName, name),
  };
}

export function indexSnowflakeCheckMetadata(
  metadata,
  { selectedTableKeys = null } = {},
) {
  let tableConstraintRows;
  let checkRows;
  try {
    tableConstraintRows = rows(metadata.tableConstraints, "tableConstraints");
    checkRows = rows(metadata.checkConstraints, "checkConstraints");
  } catch (error) {
    checkErrorOrInvalid(error);
  }

  const hasCheckRows =
    checkRows.length > 0 ||
    tableConstraintRows.some(
      (row) =>
        row &&
        typeof row === "object" &&
        String(metadataValue(row, "constraint_type") ?? "")
          .trim()
          .toUpperCase() === "CHECK",
    );
  if (!hasCheckRows) return new Map();

  const tableKinds = buildMetadataTableKinds(metadata);
  const selectedTables =
    selectedTableKeys ??
    new Set(
      rows(metadata.tables, "tables")
        .filter(
          (row) =>
            String(metadataValue(row, "table_type") ?? "")
              .trim()
              .toUpperCase() === "BASE TABLE",
        )
        .map((row) =>
          objectKey(
            checkIdentifier(metadataValue(row, "table_catalog"), "table.table_catalog"),
            checkIdentifier(metadataValue(row, "table_schema"), "table.table_schema"),
            checkIdentifier(metadataValue(row, "table_name"), "table.table_name"),
          ),
        ),
    );
  const declarations = new Map();
  for (const [rowIndex, row] of tableConstraintRows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `tableConstraints[${rowIndex}] must be an object`,
      );
    }
    const type = String(metadataValue(row, "constraint_type") ?? "")
      .trim()
      .toUpperCase();
    if (type !== "CHECK") continue;
    const identity = tableConstraintCheckIdentity(
      row,
      `tableConstraints[${rowIndex}]`,
    );
    requireSelectedCheckTable(
      identity.tableKey,
      tableKinds,
      selectedTables,
      identity.catalog,
      identity.schema,
      identity.tableName,
    );
    const declarationClause = metadataValue(row, "check_clause");
    const declarationExpression =
      declarationClause === undefined
        ? null
        : validatedCheckExpression(
            declarationClause,
            `tableConstraints[${rowIndex}].check_clause`,
          );
    if (declarations.has(identity.key)) {
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `duplicate TABLE_CONSTRAINTS CHECK row for ${identity.catalog}.${identity.schema}.${identity.tableName}.${identity.name}`,
      );
    }
    declarations.set(identity.key, {
      ...identity,
      expression: declarationExpression,
    });
  }

  const checks = new Map();
  for (const [rowIndex, row] of checkRows.entries()) {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `checkConstraints[${rowIndex}] must be an object`,
      );
    }
    const label = `checkConstraints[${rowIndex}]`;
    const identity = checkConstraintRowIdentity(row, label);
    requireSelectedCheckTable(
      identity.tableKey,
      tableKinds,
      selectedTables,
      identity.catalog,
      identity.schema,
      identity.tableName,
    );
    const expression = validatedCheckExpression(
      metadataValue(row, "check_clause"),
      `${label}.check_clause`,
    );
    const existing = checks.get(identity.key);
    if (existing) {
      if (existing.expression !== expression) {
        checkFailure(
          "SNOWFLAKE_CHECK_INVALID",
          `conflicting CHECK metadata for ${identity.catalog}.${identity.schema}.${identity.tableName}.${identity.name}`,
        );
      }
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `duplicate CHECK_CONSTRAINTS row for ${identity.catalog}.${identity.schema}.${identity.tableName}.${identity.name}`,
      );
    }
    checks.set(identity.key, { ...identity, expression });
  }

  for (const identity of declarations.values()) {
    const check = checks.get(identity.key);
    if (!check) {
      checkFailure(
        "SNOWFLAKE_CHECK_LOSS",
        `CHECK constraint ${identity.catalog}.${identity.schema}.${identity.tableName}.${identity.name} is missing from CHECK_CONSTRAINTS`,
      );
    }
    if (
      identity.expression !== null &&
      identity.expression !== check.expression
    ) {
      checkFailure(
        "SNOWFLAKE_CHECK_INVALID",
        `conflicting CHECK metadata for ${identity.catalog}.${identity.schema}.${identity.tableName}.${identity.name}`,
      );
    }
  }
  const checksByTable = new Map();
  for (const check of checks.values()) {
    const constraint = {
      id: constraintId(
        check.catalog,
        check.schema,
        check.tableName,
        check.name,
      ),
      name: check.name,
      kind: "check",
      columns: [],
      referenced_table_id: null,
      referenced_columns: [],
      expression: check.expression,
      _catalog: check.catalog,
      _schema: check.schema,
      _tableName: check.tableName,
    };
    if (!checksByTable.has(check.tableKey)) checksByTable.set(check.tableKey, []);
    checksByTable.get(check.tableKey).push(constraint);
  }
  return checksByTable;
}

function buildConstraintIndexes(metadata, tablesByKey) {
  const constraintsByTable = new Map();
  const constraintsByKey = new Map();
  const checkConstraintsByTable = indexSnowflakeCheckMetadata(
    metadata,
    { selectedTableKeys: tablesByKey },
  );

  for (const row of rows(metadata.tableConstraints, "tableConstraints")) {
    const catalog = identifier(row.table_catalog, "constraint.table_catalog");
    const schema = identifier(row.table_schema, "constraint.table_schema");
    const tableName = identifier(row.table_name, "constraint.table_name");
    const name = identifier(row.constraint_name, "constraint.constraint_name");
    const kind = CONSTRAINT_KIND.get(String(row.constraint_type).toUpperCase());
    if (!kind) continue;
    const tableKey = objectKey(catalog, schema, tableName);
    if (!tablesByKey.has(tableKey)) continue;
    const constraint = {
      id: constraintId(catalog, schema, tableName, name),
      name,
      kind,
      columns: [],
      _referencedColumnPositions: [],
      referenced_table_id: null,
      referenced_columns: [],
      _catalog: catalog,
      _schema: schema,
      _tableName: tableName,
      expression: null,
    };
    if (!constraintsByTable.has(tableKey)) constraintsByTable.set(tableKey, []);
    constraintsByTable.get(tableKey).push(constraint);
    constraintsByKey.set(constraintKey(catalog, schema, name), constraint);
  }

  const usageRows = rows(metadata.keyColumnUsage, "keyColumnUsage").sort(
    (a, b) =>
      (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0) ||
      String(a.column_name).localeCompare(String(b.column_name)),
  );
  for (const row of usageRows) {
    const catalog = identifier(
      row.constraint_catalog,
      "keyColumnUsage.constraint_catalog",
    );
    const schema = identifier(
      row.constraint_schema,
      "keyColumnUsage.constraint_schema",
    );
    const name = identifier(
      row.constraint_name,
      "keyColumnUsage.constraint_name",
    );
    const constraint = constraintsByKey.get(
      constraintKey(catalog, schema, name),
    );
    if (!constraint) continue;
    const columnName = identifier(row.column_name, "keyColumnUsage.column_name");
    const constraintColumnId = columnId(
      constraint._catalog,
      constraint._schema,
      constraint._tableName,
      columnName,
    );
    constraint.columns.push(constraintColumnId);

    const referencedColumnPosition = positiveIntegerOrNull(
      row.position_in_unique_constraint,
      "keyColumnUsage.position_in_unique_constraint",
    );
    if (
      constraint.kind === "foreign_key" &&
      referencedColumnPosition !== null
    ) {
      constraint._referencedColumnPositions.push({
        columnId: constraintColumnId,
        position: referencedColumnPosition,
      });
    }
  }

  for (const row of rows(
    metadata.referentialConstraints,
    "referentialConstraints",
  )) {
    const fk = constraintsByKey.get(
      constraintKey(
        identifier(row.constraint_catalog, "referential.constraint_catalog"),
        identifier(row.constraint_schema, "referential.constraint_schema"),
        identifier(row.constraint_name, "referential.constraint_name"),
      ),
    );
    const target = constraintsByKey.get(
      constraintKey(
        identifier(
          row.unique_constraint_catalog,
          "referential.unique_constraint_catalog",
        ),
        identifier(
          row.unique_constraint_schema,
          "referential.unique_constraint_schema",
        ),
        identifier(
          row.unique_constraint_name,
          "referential.unique_constraint_name",
        ),
      ),
    );
    if (!fk || !target || fk.kind !== "foreign_key") continue;
    fk.referenced_table_id = tableId(
      target._catalog,
      target._schema,
      target._tableName,
    );
    if (fk._referencedColumnPositions.length > 0) {
      if (fk._referencedColumnPositions.length !== fk.columns.length) {
        fail(
          `foreign key ${fk.name} has incomplete referenced column positions`,
        );
      }
      const positionsByColumnId = new Map(
        fk._referencedColumnPositions.map(({ columnId, position }) => [
          columnId,
          position,
        ]),
      );
      fk.referenced_columns = fk.columns.map((columnId) => {
        const position = positionsByColumnId.get(columnId);
        const referencedColumn = target.columns[position - 1];
        if (!referencedColumn) {
          fail(
            `foreign key ${fk.name} references missing unique constraint position ${position}`,
          );
        }
        return referencedColumn;
      });
    } else {
      fk.referenced_columns = [...target.columns];
    }
  }

  for (const constraints of constraintsByTable.values()) {
    constraints.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  for (const [tableKey, checks] of checkConstraintsByTable) {
    if (!constraintsByTable.has(tableKey)) constraintsByTable.set(tableKey, []);
    constraintsByTable.get(tableKey).push(...checks);
    constraintsByTable
      .get(tableKey)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return constraintsByTable;
}

function toProjectConstraint(constraint) {
  const projectConstraint = { ...constraint };
  delete projectConstraint._catalog;
  delete projectConstraint._schema;
  delete projectConstraint._tableName;
  delete projectConstraint._referencedColumnPositions;
  return projectConstraint;
}

function buildTables(
  metadata,
  tableRows,
  constraintsByTable,
  describeIndex,
  options = {},
) {
  const columnsByTable = new Map();
  for (const row of rows(metadata.columns, "columns")) {
    const catalog = identifier(row.table_catalog, "column.table_catalog");
    const schema = identifier(row.table_schema, "column.table_schema");
    const tableName = identifier(row.table_name, "column.table_name");
    const key = objectKey(catalog, schema, tableName);
    if (!columnsByTable.has(key)) columnsByTable.set(key, []);
    columnsByTable.get(key).push(row);
  }

  return sortById(
    tableRows.map((tableRow) => {
      const catalog = identifier(tableRow.table_catalog, "table.table_catalog");
      const schema = identifier(tableRow.table_schema, "table.table_schema");
      const tableName = identifier(tableRow.table_name, "table.table_name");
      const key = objectKey(catalog, schema, tableName);
      const sortedColumns = [...(columnsByTable.get(key) ?? [])].sort(
        (a, b) =>
          (a.ordinal_position ?? 0) - (b.ordinal_position ?? 0) ||
          String(a.column_name).localeCompare(String(b.column_name)),
      );
      if (sortedColumns.length === 0) {
        fail(`table ${catalog}.${schema}.${tableName} has no columns`);
      }

      return {
        id: tableId(catalog, schema, tableName),
        namespace_id: namespaceId(catalog, schema),
        name: tableName,
        kind: "table",
        columns: sortedColumns.map((columnRow, index) => {
          const columnName = identifier(
            columnRow.column_name,
            "column.column_name",
          );
          return {
            id: columnId(catalog, schema, tableName, columnName),
            name: columnName,
            ordinal: index + 1,
            data_type: canonicalDataType(columnRow, describeIndex, options),
            nullable: String(columnRow.is_nullable).toUpperCase() !== "NO",
            default: optionalString(columnRow.column_default),
            comment: optionalString(columnRow.comment),
          };
        }),
        constraints: (constraintsByTable.get(key) ?? []).map(
          toProjectConstraint,
        ),
        comment: optionalString(tableRow.comment),
      };
    }),
  );
}

function buildRelationships(tables) {
  return sortById(
    tables.flatMap((table) =>
      table.constraints
        .filter((constraint) => constraint.kind === "foreign_key")
        .map((constraint) => {
          const { catalog, schema } = namespaceParts(table.namespace_id);
          return {
            id: relationshipId(catalog, schema, table.name, constraint.name),
            name: constraint.name,
            source_table_id: table.id,
            source_column_ids: constraint.columns,
            target_table_id: constraint.referenced_table_id,
            target_column_ids: constraint.referenced_columns,
            cardinality: "many_to_one",
          };
        }),
    ),
  );
}

function layoutForTables(tables) {
  return Object.fromEntries(
    tables.map((table, index) => [
      table.id,
      { x: index * FALLBACK_X_STEP, y: FALLBACK_Y },
    ]),
  );
}

export function snowflakeMetadataToCanonicalProject(metadata, options = {}) {
  const source = metadataObject(metadata);
  const tableRows = rows(source.tables, "tables").filter(
    (table) => String(table.table_type).toUpperCase() === "BASE TABLE",
  );
  const tablesByKey = new Set(
    tableRows.map((table) =>
      objectKey(
        identifier(table.table_catalog, "table.table_catalog"),
        identifier(table.table_schema, "table.table_schema"),
        identifier(table.table_name, "table.table_name"),
      ),
    ),
  );
  const expectedVectorColumns = expectedVectorColumnIndex(
    source,
    tableRows,
    options,
  );
  const describeIndex = buildDescribeTypeIndex(source, expectedVectorColumns);
  const constraintsByTable = buildConstraintIndexes(source, tablesByKey);
  const tables = buildTables(
    source,
    tableRows,
    constraintsByTable,
    describeIndex,
    options,
  );
  const project = {
    project_version: PROJECT_VERSION,
    physical_model: {
      model_version: MODEL_VERSION,
      name:
        typeof options.name === "string" && options.name.trim()
          ? options.name
          : "snowflake-metadata",
      namespaces: buildNamespaces(source, tableRows),
      tables,
      relationships: buildRelationships(tables),
    },
    diagram_layout: {
      nodes: layoutForTables(tables),
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };

  canonicalProjectToDiagram(project);
  return project;
}

export function snowflakeMetadataToDiagram(metadata, options = {}) {
  const project = snowflakeMetadataToCanonicalProject(metadata, {
    ...options,
    name: options.title || options.name,
  });
  return {
    ...canonicalProjectToDiagram(project),
    database: "snowflake",
    title:
      typeof options.title === "string" && options.title.trim()
        ? options.title
        : project.physical_model.name,
    notes: [],
    areas: [],
    types: [],
    enums: [],
  };
}
