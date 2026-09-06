import { canonicalProjectToDiagram } from "./projectAdapter.js";
import {
  SNOWFLAKE_TYPE_FAMILIES,
  SNOWFLAKE_TYPE_ALIASES,
  SNOWFLAKE_TYPE_BOUNDS,
  snowflakeTypeText,
  validateSnowflakeType,
} from "./snowflakeTypeContract.js";

const PROJECT_VERSION = "1";
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

function integerOrNull(value, label) {
  if (value === null || value === undefined) return null;
  if (!Number.isInteger(value)) fail(`${label} must be an integer`);
  return value;
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

function canonicalDataType(column) {
  const rawToken = identifier(column.data_type, "column.data_type");
  let family = rawToken;
  if (family === "FIXED") {
    family = "NUMBER";
  } else if (family in SNOWFLAKE_TYPE_ALIASES) {
    family = SNOWFLAKE_TYPE_ALIASES[family];
  }
  if (!SNOWFLAKE_TYPE_FAMILIES.includes(family)) {
    fail(`unsupported Snowflake data type ${family}`);
  }

  const precision = integerOrNull(
    column.numeric_precision,
    "column.numeric_precision",
  );
  const scale = integerOrNull(column.numeric_scale, "column.numeric_scale");
  const length = integerOrNull(
    column.character_maximum_length,
    "column.character_maximum_length",
  );
  const datetimePrecision = integerOrNull(
    column.datetime_precision,
    "column.datetime_precision",
  );

  let resolvedPrecision = null;
  let resolvedScale = null;
  let resolvedLength = null;

  if (family === "NUMBER") {
    resolvedPrecision =
      precision ?? SNOWFLAKE_TYPE_BOUNDS.NUMBER.defaultPrecision;
    resolvedScale = scale ?? SNOWFLAKE_TYPE_BOUNDS.NUMBER.defaultScale;
  } else if (family === "VARCHAR") {
    // CHAR/CHARACTER/NCHAR keep their distinct bare default (1) before
    // normalizing to VARCHAR; every other VARCHAR alias defaults to the max.
    const charFamily =
      rawToken === "CHAR" || rawToken === "CHARACTER" || rawToken === "NCHAR";
    resolvedLength =
      length ?? (charFamily ? 1 : SNOWFLAKE_TYPE_BOUNDS.VARCHAR.defaultLength);
  } else if (family === "BINARY") {
    resolvedLength = length ?? SNOWFLAKE_TYPE_BOUNDS.BINARY.defaultLength;
  } else if (
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ" ||
    family === "TIME"
  ) {
    resolvedPrecision =
      datetimePrecision ??
      precision ??
      SNOWFLAKE_TYPE_BOUNDS[family].defaultPrecision;
  }

  const candidate7 = {
    family,
    precision: resolvedPrecision,
    scale: resolvedScale,
    length: resolvedLength,
    vector_element_type: null,
    vector_dimension: null,
  };
  candidate7.text = snowflakeTypeText(candidate7);
  validateSnowflakeType(candidate7);

  return {
    family,
    text: candidate7.text,
    precision: resolvedPrecision,
    scale: resolvedScale,
    length: resolvedLength,
    vector_element_type: null,
    vector_dimension: null,
  };
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

function buildConstraintIndexes(metadata, tablesByKey) {
  const constraintsByTable = new Map();
  const constraintsByKey = new Map();

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

function buildCheckConstraints(metadata, tablesByKey) {
  const checksByTable = new Map();
  const rawRows = metadata.checkConstraints === undefined ? [] : rows(metadata.checkConstraints, "checkConstraints");

  for (const row of rawRows) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) {
      fail("checkConstraint row must be an object");
    }
    const catalog = identifier(
      row.constraint_catalog,
      "checkConstraint.constraint_catalog",
    );
    const schema = identifier(
      row.constraint_schema,
      "checkConstraint.constraint_schema",
    );
    const tableName = identifier(
      row.constraint_table,
      "checkConstraint.constraint_table",
    );
    const tableKey = objectKey(catalog, schema, tableName);
    if (!tablesByKey.has(tableKey)) {
      fail(
        `check constraint references table ${catalog}.${schema}.${tableName} which is not in the selection`,
      );
    }
    if (typeof row.constraint_name !== "string" || !row.constraint_name.trim()) {
      fail("check constraint name must be a nonblank string");
    }
    const name = identifier(
      row.constraint_name,
      "checkConstraint.constraint_name",
    );
    if (typeof row.check_clause !== "string" || !row.check_clause.trim()) {
      fail("check constraint check_clause must be a nonblank string");
    }
    const expression = row.check_clause.trim();

    const check = {
      id: constraintId(catalog, schema, tableName, name),
      name,
      expression,
      validation: "UNKNOWN",
      name_origin: "unknown",
    };

    if (!checksByTable.has(tableKey)) {
      checksByTable.set(tableKey, []);
    }
    const existing = checksByTable.get(tableKey);
    if (existing.some((c) => c.id === check.id)) {
      fail(`duplicate check constraint id ${check.id}`);
    }
    existing.push(check);
  }

  for (const checks of checksByTable.values()) {
    checks.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  return checksByTable;
}

function buildTables(metadata, tableRows, constraintsByTable, checkConstraintsByTable) {
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
            data_type: canonicalDataType(columnRow),
            nullable: String(columnRow.is_nullable).toUpperCase() !== "NO",
            default: optionalString(columnRow.column_default),
            comment: optionalString(columnRow.comment),
          };
        }),
        constraints: (constraintsByTable.get(key) ?? []).map(
          toProjectConstraint,
        ),
        check_constraints: sortById(checkConstraintsByTable.get(key) ?? []),
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
  const constraintsByTable = buildConstraintIndexes(source, tablesByKey);
  const checkConstraintsByTable = buildCheckConstraints(source, tablesByKey);
  const tables = buildTables(
    source,
    tableRows,
    constraintsByTable,
    checkConstraintsByTable,
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
