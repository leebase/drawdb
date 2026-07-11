const PROJECT_VERSION = "1";
const MODEL_VERSION = "1";
const SNOWFLAKE_IDENTIFIER_MAX_LENGTH = 255;

const TOP_LEVEL_ALLOWED = new Set([
  "project_version",
  "physical_model",
  "diagram_layout",
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
const DATA_TYPE_KEYS = new Set([
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

const SUPPORTED_TYPE_FAMILIES = new Set([
  "NUMBER",
  "FLOAT",
  "VARCHAR",
  "DATE",
  "TIMESTAMP_NTZ",
  "BOOLEAN",
  "BINARY",
]);

const FALLBACK_X_STEP = 280;
const FALLBACK_Y = 80;
const SNOWFLAKE_UNQUOTED_IDENT_RE = /^[A-Z_][A-Z0-9_$]*$/;

function fail(message) {
  throw new Error(message);
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

function requireOptionalInt(value, label) {
  if (value === null) {
    return null;
  }
  return requireInt(value, label);
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
    fail(`${label} normalizes to an empty identifier: ${JSON.stringify(value)}`);
  }
  if (normalized.length > SNOWFLAKE_IDENTIFIER_MAX_LENGTH) {
    fail(
      `${label} exceeds Snowflake's ${SNOWFLAKE_IDENTIFIER_MAX_LENGTH}-character limit`,
    );
  }
  return normalized;
}

function canonicalTypeText(family, { precision, scale, length }) {
  switch (family) {
    case "NUMBER":
      return `NUMBER(${precision}, ${scale})`;
    case "VARCHAR":
      return `VARCHAR(${length})`;
    case "DATE":
      return "DATE";
    case "TIMESTAMP_NTZ":
      return `TIMESTAMP_NTZ(${precision})`;
    case "BOOLEAN":
      return "BOOLEAN";
    case "FLOAT":
      return "FLOAT";
    case "BINARY":
      return `BINARY(${length})`;
    default:
      fail(`unsupported type family ${family}`);
  }
}

function assertTypeBounds(family, { precision, scale, length }, label) {
  if (family === "NUMBER") {
    if (precision === null) {
      fail(`${label}: precision is required for NUMBER`);
    }
    if (scale === null) {
      fail(`${label}: scale is required for NUMBER`);
    }
    if (length !== null) {
      fail(`${label}: length must be null for NUMBER`);
    }
    if (precision < 1 || precision > 38) {
      fail(`${label}: precision must be between 1 and 38 for NUMBER`);
    }
    const maxScale = Math.min(37, precision);
    if (scale < 0 || scale > maxScale) {
      fail(
        `${label}: scale must be between 0 and ${maxScale} for NUMBER`,
      );
    }
  } else if (family === "VARCHAR") {
    if (length === null) {
      fail(`${label}: length is required for VARCHAR`);
    }
    if (precision !== null || scale !== null) {
      fail(`${label}: precision and scale must be null for VARCHAR`);
    }
    if (length < 1 || length > 16777216) {
      fail(`${label}: length must be between 1 and 16777216 for VARCHAR`);
    }
  } else if (family === "TIMESTAMP_NTZ") {
    if (precision === null) {
      fail(`${label}: precision is required for TIMESTAMP_NTZ`);
    }
    if (scale !== null || length !== null) {
      fail(`${label}: scale and length must be null for TIMESTAMP_NTZ`);
    }
    if (precision < 0 || precision > 9) {
      fail(`${label}: precision must be between 0 and 9 for TIMESTAMP_NTZ`);
    }
  } else if (family === "BINARY") {
    if (length === null) {
      fail(`${label}: length is required for BINARY`);
    }
    if (precision !== null || scale !== null) {
      fail(`${label}: precision and scale must be null for BINARY`);
    }
    if (length < 1 || length > 8388608) {
      fail(`${label}: length must be between 1 and 8388608 for BINARY`);
    }
  } else if (family === "DATE" || family === "BOOLEAN" || family === "FLOAT") {
    if (precision !== null || scale !== null || length !== null) {
      fail(
        `${label}: precision, scale, and length must be null for ${family}`,
      );
    }
  }
}

function validateDataType(dataType, label) {
  requireObject(dataType, label);
  requireExactKeys(dataType, DATA_TYPE_KEYS, label);
  const family = requireNonblankString(dataType.family, `${label}.family`).toUpperCase();
  if (!SUPPORTED_TYPE_FAMILIES.has(family)) {
    fail(`unsupported type family ${family}`);
  }
  const precision = requireOptionalInt(dataType.precision, `${label}.precision`);
  const scale = requireOptionalInt(dataType.scale, `${label}.scale`);
  const length = requireOptionalInt(dataType.length, `${label}.length`);
  assertTypeBounds(family, { precision, scale, length }, label);
  const text = requireNonblankString(dataType.text, `${label}.text`);
  const expected = canonicalTypeText(family, { precision, scale, length });
  if (text !== expected) {
    fail(`${label}.text must equal ${JSON.stringify(expected)}`);
  }
  return { family, text, precision, scale, length };
}

function fieldSizeFromDataType(dataType) {
  if (dataType.family === "NUMBER") {
    return `${dataType.precision},${dataType.scale}`;
  }
  if (dataType.family === "VARCHAR" || dataType.family === "BINARY") {
    return dataType.length;
  }
  if (dataType.family === "TIMESTAMP_NTZ") {
    return dataType.precision;
  }
  return undefined;
}

function dataTypeFromField(field) {
  const family = requireNonblankString(field.type, "field.type").toUpperCase();
  if (!SUPPORTED_TYPE_FAMILIES.has(family)) {
    fail(`unsupported field type ${family}`);
  }
  let precision = null;
  let scale = null;
  let length = null;
  const size = field.size;
  const label = `field ${field.name}`;

  if (family === "NUMBER") {
    if (size === undefined || size === null || size === "") {
      fail(`NUMBER field ${field.name} requires size`);
    }
    const parts = String(size).split(",").map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => part === "" || Number.isNaN(Number(part)))) {
      fail(`NUMBER field ${field.name} has malformed size ${JSON.stringify(size)}`);
    }
    precision = Number(parts[0]);
    scale = Number(parts[1]);
    if (!Number.isInteger(precision) || !Number.isInteger(scale)) {
      fail(`NUMBER field ${field.name} size must be integers`);
    }
  } else if (family === "VARCHAR" || family === "BINARY") {
    if (size === undefined || size === null || size === "") {
      fail(`${family} field ${field.name} requires size`);
    }
    length = Number(size);
    if (!Number.isInteger(length)) {
      fail(`${family} field ${field.name} size must be an integer`);
    }
  } else if (family === "TIMESTAMP_NTZ") {
    if (size === undefined || size === null || size === "") {
      fail(`TIMESTAMP_NTZ field ${field.name} requires size`);
    }
    precision = Number(size);
    if (!Number.isInteger(precision)) {
      fail(`TIMESTAMP_NTZ field ${field.name} size must be an integer`);
    }
  } else if (size !== undefined && size !== null && size !== "") {
    fail(`${family} field ${field.name} must remain parameterless`);
  }

  assertTypeBounds(family, { precision, scale, length }, label);
  const text = canonicalTypeText(family, { precision, scale, length });
  return { family, text, precision, scale, length };
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
      fail(`diagram_layout references unknown table id ${JSON.stringify(nodeId)}`);
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

function validatePhysicalModel(model) {
  requireObject(model, "physical_model");
  requireExactKeys(model, PHYSICAL_MODEL_KEYS, "physical model");
  assertNoForbiddenKeys(model, "physical_model");

  const modelVersion = requireNonblankString(model.model_version, "model_version");
  if (modelVersion !== MODEL_VERSION) {
    fail(`Unsupported model_version ${JSON.stringify(modelVersion)}; expected "1"`);
  }
  const name = requireNonblankString(model.name, "name");
  const namespaces = requireArray(model.namespaces, "namespaces").map((ns, index) => {
    requireObject(ns, `namespaces[${index}]`);
    requireExactKeys(ns, NAMESPACE_KEYS, "namespace");
    return {
      id: requireNonblankString(ns.id, "id"),
      catalog: requireLegalSnowflakeIdentifier(ns.catalog, "catalog"),
      schema: requireLegalSnowflakeIdentifier(ns.schema, "schema"),
    };
  });
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
    const columns = requireArray(table.columns, "columns").map((column, colIndex) => {
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
    });
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
        requireExactKeys(constraint, CONSTRAINT_KEYS, "constraint");
        const constraintColumns = requireArray(constraint.columns, "columns").map((id) =>
          requireNonblankString(id, "constraint column id"),
        );
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
    const primaryKeyCount = constraints.filter((c) => c.kind === "primary_key").length;
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
    const expectedTableId = tableId(namespace.catalog, namespace.schema, table.name);
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
        if (!constraint.referenced_table_id || !tableIds.has(constraint.referenced_table_id)) {
          fail(
            `unresolved referenced table id ${JSON.stringify(constraint.referenced_table_id)}`,
          );
        }
        if (constraint.referenced_columns.length === 0) {
          fail("referenced_columns is required for foreign_key");
        }
        if (constraint.referenced_columns.length !== constraint.columns.length) {
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
      const sourceColumnIds = requireArray(rel.source_column_ids, "source_column_ids").map(
        (id) => requireNonblankString(id, "source column id"),
      );
      const targetColumnIds = requireArray(rel.target_column_ids, "target_column_ids").map(
        (id) => requireNonblankString(id, "target column id"),
      );
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
        source_table_id: requireNonblankString(rel.source_table_id, "source_table_id"),
        source_column_ids: sourceColumnIds,
        target_table_id: requireNonblankString(rel.target_table_id, "target_table_id"),
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

export function canonicalProjectToDiagram(project) {
  requireObject(project, "project");
  const unexpected = Object.keys(project).filter((key) => !TOP_LEVEL_ALLOWED.has(key));
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
      color: "#175e7a",
      collapsed: false,
      ...(Object.keys(constraintView).length > 0
        ? { constraintView }
        : {}),
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
}) {
  const modelName = requireNonblankString(title, "title");
  requireArray(tables, "tables");
  requireArray(relationships, "relationships");
  requireObject(transform, "transform");

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
    return {
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
          field.default === undefined || field.default === null || field.default === ""
            ? null
            : String(field.default),
        comment:
          field.comment === undefined || field.comment === null || field.comment === ""
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
      const pkName = reusedPkName || toSnowflakeIdentifier(`PK_${tableName}`, "constraint");
      claimUniqueName(uniqueNameSeen, pkName, "constraint");
      constraints.push({
        id: constraintId(namespace.catalog, namespace.schema, tableName, pkName),
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
          ? toSnowflakeIdentifier(storedUniqueNames[column._oldId], "constraint")
          : null;
      const uqName = claimUniqueName(
        uniqueNameSeen,
        reusedUniqueName ||
          toSnowflakeIdentifier(`UQ_${tableName}_${column.name}`, "constraint"),
        "constraint",
      );
      constraints.push({
        id: constraintId(namespace.catalog, namespace.schema, tableName, uqName),
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
        id: constraintId(namespace.catalog, namespace.schema, tableName, uqName),
        name: uqName,
        kind: "unique",
        columns: columnIds,
        referenced_table_id: null,
        referenced_columns: [],
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
        table.comment === undefined || table.comment === null || table.comment === ""
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
      fail("relationship source and target column lists must have equal length");
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

  return {
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
    fail(`namespace_id references unknown namespace ${JSON.stringify(table.namespace_id)}`);
  }
  return namespace;
}

function renderColumn(column) {
  const parts = [column.name, column.data_type.text];
  if (!column.nullable) {
    parts.push("NOT NULL");
  }
  if (column.default !== null) {
    parts.push(`DEFAULT ${column.default}`);
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
