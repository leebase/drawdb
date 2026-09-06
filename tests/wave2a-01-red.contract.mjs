import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diagramToCanonicalProject,
  parseSnowflakeDDLToCanonicalProject,
  renderCanonicalSnowflakeDDL,
} from "../src/erdTool/projectAdapter.js";
import { openDesktopProject } from "../src/erdTool/desktopBridge.js";
import {
  snowflakeMetadataToCanonicalProject,
  snowflakeMetadataToDiagram,
} from "../src/erdTool/snowflakeMetadata.js";
import { createSnowflakeService } from "../src/electron/snowflakeService.js";
import { cloneFixture, vectorFixtures, v1Fixtures } from "./wave2a-01-fixtures.mjs";
import {
  assertSemanticEqual,
} from "./wave2a-01-parity.mjs";

function vectorDiagram(fields) {
  return {
    database: "snowflake",
    title: "VECTOR_CONTRACT",
    tables: [
      {
        id: "vector-table",
        name: "VECTOR_TABLE",
        x: 0,
        y: 0,
        fields,
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

function vectorField(id, name, size) {
  return {
    id,
    name,
    type: "VECTOR",
    size,
    default: "",
    check: "",
    primary: false,
    unique: false,
    notNull: false,
    increment: false,
    comment: "",
  };
}

function singleFieldDiagram(type, size, name = "VALUE") {
  return {
    database: "snowflake",
    title: "SINGLE_FIELD_CONTRACT",
    tables: [
      {
        id: "single-field-table",
        name: "SINGLE_FIELD",
        x: 0,
        y: 0,
        fields: [
          {
            id: "single-field",
            name,
            type,
            size,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "",
          },
        ],
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

function checkDiagram() {
  return {
    database: "snowflake",
    title: "CHECK_CONTRACT",
    tables: [
      {
        id: "checked-table",
        name: "CHECKED_TABLE",
        x: 0,
        y: 0,
        fields: [
          {
            id: "amount",
            name: "AMOUNT",
            type: "NUMBER",
            size: "12,2",
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Non-negative amount",
          },
          {
            id: "start-at",
            name: "START_AT",
            type: "TIMESTAMP_NTZ",
            size: 9,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "Window start",
          },
          {
            id: "end-at",
            name: "END_AT",
            type: "TIMESTAMP_NTZ",
            size: 9,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "Window end",
          },
        ],
        // CHECK belongs to the table because an expression may reference zero,
        // one, or multiple columns.  The physical target is table.check_constraints.
        checkConstraints: [
          {
            id: "check-amount",
            name: "CK_CHECKED_AMOUNT",
            expression: "AMOUNT >= 0",
            // Editor-authored checks are enforced and their provenance is
            // known at creation time. UNKNOWN/unknown are metadata-only
            // values because Snowflake does not expose either fact.
            validation: "VALIDATE",
            nameOrigin: "explicit",
          },
          {
            id: "check-window",
            name: null,
            expression: "START_AT <= END_AT",
            validation: "VALIDATE",
            nameOrigin: "unnamed",
          },
        ],
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

async function openSerializedProject(serialized) {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      drawdbDesktop: {
        projectFiles: {
          open: async () => ({
            canceled: false,
            contents: JSON.stringify(serialized),
            modifiedAt: "2026-09-04T00:00:00.000Z",
          }),
        },
      },
    };
    return await openDesktopProject();
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

function metadataColumn(
  table,
  name,
  dataType,
  ordinal,
  overrides = {},
) {
  return {
    table_catalog: "ANALYTICS",
    table_schema: "CORE",
    table_name: table,
    column_name: name,
    ordinal_position: ordinal,
    column_default: null,
    is_nullable: "YES",
    data_type: dataType,
    character_maximum_length: null,
    numeric_precision: null,
    numeric_scale: null,
    datetime_precision: null,
    comment: null,
    ...overrides,
  };
}

function checkMetadataFixture({ columns = [metadataColumn("CHECKED", "SCORE", "NUMBER", 1)] } = {}) {
  return {
    schemata: [
      { catalog_name: "ANALYTICS", schema_name: "CORE", schema_comment: null },
    ],
    tables: [
      {
        table_catalog: "ANALYTICS",
        table_schema: "CORE",
        table_name: "CHECKED",
        table_type: "BASE TABLE",
        comment: null,
      },
    ],
    columns,
    // CHECK_CONSTRAINTS is authoritative for CHECK rows. TABLE_CONSTRAINTS
    // remains reserved for key constraints (PRIMARY/UNIQUE/FOREIGN KEY).
    tableConstraints: [],
    checkConstraints: [
      {
        constraint_catalog: "ANALYTICS",
        constraint_schema: "CORE",
        constraint_table: "CHECKED",
        constraint_name: "CK_CHECKED_SCORE",
        check_clause: "SCORE >= 0",
      },
    ],
    keyColumnUsage: [],
    referentialConstraints: [],
  };
}

function mockSnowflakeDriver({
  database = "ANALYTICS",
  schema = "CORE",
  tableName = "CHECKED",
  tables = [tableName],
  columns = [metadataColumn(tableName, "SCORE", "NUMBER", 1)],
  tableConstraints = [],
  checkConstraints = [],
} = {}) {
  const observed = { queries: [], checkQueries: [], destroyed: 0 };
  const expectedCheckBinds = [database, schema, ...tables];
  const expectedCheckQuery = [
    "SELECT CONSTRAINT_CATALOG, CONSTRAINT_SCHEMA, CONSTRAINT_TABLE, CONSTRAINT_NAME, CHECK_CLAUSE",
    `FROM \"${database}\".INFORMATION_SCHEMA.CHECK_CONSTRAINTS`,
    `WHERE CONSTRAINT_CATALOG = ? AND CONSTRAINT_SCHEMA = ? AND CONSTRAINT_TABLE IN (${tables.map(() => "?").join(", ")})`,
    "ORDER BY CONSTRAINT_TABLE, CONSTRAINT_NAME",
  ].join(" ");
  const tableRows = [
    {
      TABLE_CATALOG: "ANALYTICS",
      TABLE_SCHEMA: "CORE",
      TABLE_NAME: tableName,
      TABLE_TYPE: "BASE TABLE",
      COMMENT: null,
    },
  ];

  function rowsFor(sqlText, binds) {
    const upper = sqlText.toUpperCase();
    if (upper.includes("CURRENT_ACCOUNT()")) {
      return [
        {
          ACCOUNT: "ANALYTICS",
          USERNAME: "TEST_USER",
          ROLE: "TEST_ROLE",
          WAREHOUSE: "TEST_WH",
        },
      ];
    }
    if (upper.includes(".SCHEMATA")) {
      return [
        {
          CATALOG_NAME: "ANALYTICS",
          SCHEMA_NAME: "CORE",
          COMMENT: null,
        },
      ];
    }
    if (upper.includes(".TABLES")) return tableRows;
    if (upper.includes(".COLUMNS")) return columns;
    if (upper.includes(".CHECK_CONSTRAINTS")) {
      const normalizedSql = sqlText.replace(/\s+/g, " ").trim();
      assert.equal(
        normalizedSql.toUpperCase(),
        expectedCheckQuery.toUpperCase(),
        "CHECK_CONSTRAINTS query must select the official columns, use the database-qualified view, and apply the deterministic table filters",
      );
      assert.deepEqual(
        binds,
        expectedCheckBinds,
        "CHECK_CONSTRAINTS query binds must be [database, schema, ...tables]",
      );
      observed.checkQueries.push({ sqlText, binds: [...binds] });
      return checkConstraints;
    }
    if (upper.includes(".TABLE_CONSTRAINTS")) return tableConstraints;
    if (upper.startsWith("SHOW PRIMARY KEYS")) return [];
    if (upper.startsWith("SHOW UNIQUE KEYS")) return [];
    if (upper.startsWith("SHOW IMPORTED KEYS")) return [];
    throw new Error(`Unexpected mock Snowflake query: ${sqlText}`);
  }

  const connection = {
    connect(callback) {
      queueMicrotask(() => callback());
    },
    execute({ sqlText, binds, complete }) {
      observed.queries.push({ sqlText, binds });
      queueMicrotask(() => {
        try {
          complete(undefined, {}, rowsFor(sqlText, binds));
        } catch (error) {
          complete(error, {}, []);
        }
      });
      return { cancel(callback) { callback?.(); } };
    },
    destroy(callback) {
      observed.destroyed += 1;
      callback?.();
    },
  };

  return {
    observed,
    driver: {
      configure() {},
      createConnection() {
        return connection;
      },
    },
  };
}

async function connectedService(mock) {
  const service = createSnowflakeService({
    driver: mock.driver,
    createId: () => "wave2a-session",
  });
  await service.connect({
    mode: "manual",
    account: "ANALYTICS",
    username: "TEST_USER",
    password: "test-password",
  });
  return service;
}

describe("Wave 2A explicit RED contracts (known defects)", () => {
  it("does not guess a valid DDL type for an unresolved canonical-v1 bare VECTOR", async () => {
    const fixture = cloneFixture(v1Fixtures.bareVector);
    assert.equal(fixture.serialized.project_version, "1");
    assert.equal(fixture.serialized.physical_model.model_version, "1");
    assert.deepEqual(fixture.expected, {
      exportable: false,
      status: "unresolved",
      reason: "VECTOR requires an INT or FLOAT element type and a positive dimension",
    });

    const opened = await openSerializedProject(fixture.serialized);
    // Either rejecting at the canonical boundary or rejecting at the renderer
    // is acceptable while the fixture remains unresolved; emitting DDL is not.
    assert.throws(
      () =>
        renderCanonicalSnowflakeDDL(diagramToCanonicalProject(opened.diagram)),
      /VECTOR|element|dimension|unsupported/i,
    );
  });

  it("accepts VECTOR(INT|FLOAT, dimension) and preserves both parameters", () => {
    const fields = vectorFixtures.valid.map((fixture, index) =>
      vectorField(`vector-${index}`, `VECTOR_${fixture.element}`, fixture.size),
    );
    const project = diagramToCanonicalProject(vectorDiagram(fields));
    const columns = project.physical_model.tables[0].columns;

    assert.deepEqual(
      columns.map((column) => ({
        family: column.data_type.family,
        text: column.data_type.text,
        precision: column.data_type.precision,
        scale: column.data_type.scale,
        length: column.data_type.length,
        vector_element_type: column.data_type.vector_element_type ?? null,
        vector_dimension: column.data_type.vector_dimension ?? null,
      })),
      [
        {
          family: "VECTOR",
          text: "VECTOR(INT, 3)",
          precision: null,
          scale: null,
          length: null,
          vector_element_type: "INT",
          vector_dimension: 3,
        },
        {
          family: "VECTOR",
          text: "VECTOR(FLOAT, 1536)",
          precision: null,
          scale: null,
          length: null,
          vector_element_type: "FLOAT",
          vector_dimension: 1536,
        },
      ],
    );

    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(ddl, /VECTOR_INT VECTOR\(INT, 3\)/);
    assert.match(ddl, /VECTOR_FLOAT VECTOR\(FLOAT, 1536\)/);
    const imported = parseSnowflakeDDLToCanonicalProject(ddl, {
      name: project.physical_model.name,
    });
    assertSemanticEqual(assert, imported, project);
  });

  it("preserves table-level Snowflake CHECK collections through canonical model and deterministic DDL", () => {
    const project = diagramToCanonicalProject(checkDiagram());
    const checks = project.physical_model.tables[0].check_constraints;
    const ddl = renderCanonicalSnowflakeDDL(project);

    assert.deepEqual(checks, [
      {
        id: "check-amount",
        name: "CK_CHECKED_AMOUNT",
        expression: "AMOUNT >= 0",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
      {
        id: "check-window",
        name: null,
        expression: "START_AT <= END_AT",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
    ]);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
    assert.doesNotMatch(
      ddl,
      /\b(?:NOT\s+ENFORCED|RELY|DISABLE)\b/i,
      "CHECK DDL must never use informational or disabled constraint grammar",
    );
    assert.match(ddl, /CONSTRAINT CK_CHECKED_AMOUNT CHECK \(AMOUNT >= 0\)/);
    assert.match(ddl, /CHECK \(START_AT <= END_AT\)/);

    const parsed = parseSnowflakeDDLToCanonicalProject(ddl, {
      name: project.physical_model.name,
    });
    assertSemanticEqual(
      assert,
      parsed,
      project,
      "named and unnamed editor CHECKs must survive DDL parse-back",
    );
  });

  it("preserves named and unnamed table CHECKs through serialized project reopen and DDL reparse", async () => {
    // JSON cloning plus the real desktop open/conversion seam models a native
    // project file without touching a filesystem or starting Electron.
    const original = diagramToCanonicalProject(checkDiagram());
    const serializedClone = JSON.parse(JSON.stringify(original));
    const opened = await openSerializedProject(serializedClone);
    assert.equal(opened.canceled, false);

    const reopened = diagramToCanonicalProject(opened.diagram);
    const ddl = renderCanonicalSnowflakeDDL(reopened);
    const reparsed = parseSnowflakeDDLToCanonicalProject(ddl, {
      name: original.physical_model.name,
    });

    assertSemanticEqual(
      assert,
      reopened,
      original,
      "named and unnamed table CHECKs must survive serialized project reopen",
    );
    assertSemanticEqual(
      assert,
      reparsed,
      original,
      "named and unnamed table CHECKs must survive DDL reparse after reopen",
    );
  });

  it("issues a CHECK_CONSTRAINTS metadata query during reverse engineering", async () => {
    const checkRow = {
      CONSTRAINT_CATALOG: "ANALYTICS",
      CONSTRAINT_SCHEMA: "CORE",
      CONSTRAINT_TABLE: "CHECKED",
      CONSTRAINT_NAME: "CK_CHECKED_SCORE",
      CHECK_CLAUSE: "SCORE >= 0",
    };
    const mock = mockSnowflakeDriver({
      checkConstraints: [checkRow],
    });
    const service = await connectedService(mock);
    const metadata = await service.reverseEngineer({
      sessionId: "wave2a-session",
      database: "ANALYTICS",
      schema: "CORE",
      tables: ["CHECKED"],
    });

    assert.equal(
      mock.observed.checkQueries.length,
      1,
      "reverse engineering must query INFORMATION_SCHEMA.CHECK_CONSTRAINTS exactly once",
    );
    assert.deepEqual(mock.observed.checkQueries[0].binds, [
      "ANALYTICS",
      "CORE",
      "CHECKED",
    ]);
    assert.deepEqual(metadata.checkConstraints, [
      {
        constraint_catalog: "ANALYTICS",
        constraint_schema: "CORE",
        constraint_table: "CHECKED",
        constraint_name: "CK_CHECKED_SCORE",
        check_clause: "SCORE >= 0",
      },
    ]);
  });

  it("maps mocked CHECK_CONSTRAINTS rows into table-level canonical and editor CHECK collections", () => {
    const metadata = checkMetadataFixture();
    const project = snowflakeMetadataToCanonicalProject(metadata, {
      name: "CHECKED",
    });
    const diagram = snowflakeMetadataToDiagram(metadata, { title: "CHECKED" });

    assert.deepEqual(project.physical_model.tables[0].check_constraints, [
      {
        id: "constraint:ANALYTICS.CORE.CHECKED.CK_CHECKED_SCORE",
        name: "CK_CHECKED_SCORE",
        expression: "SCORE >= 0",
        validation: "UNKNOWN",
        name_origin: "unknown",
      },
    ]);
    assert.deepEqual(diagram.tables[0].checkConstraints, [
      {
        id: "constraint:ANALYTICS.CORE.CHECKED.CK_CHECKED_SCORE",
        name: "CK_CHECKED_SCORE",
        expression: "SCORE >= 0",
        validation: "UNKNOWN",
        nameOrigin: "unknown",
      },
    ]);
  });

  it("maps explicit Snowflake VARCHAR/BINARY metadata maxima without truncation", () => {
    const metadata = checkMetadataFixture({
      columns: [
        metadataColumn("CHECKED", "VARCHAR_MAX", "VARCHAR", 1, {
          character_maximum_length: 134_217_728,
        }),
        metadataColumn("CHECKED", "BINARY_MAX", "BINARY", 2, {
          character_maximum_length: 67_108_864,
        }),
      ],
    });
    const project = snowflakeMetadataToCanonicalProject(metadata, {
      name: "EXPLICIT_BOUNDS",
    });

    assert.deepEqual(
      project.physical_model.tables[0].columns.map((column) => column.data_type),
      [
        {
          family: "VARCHAR",
          text: "VARCHAR(134217728)",
          precision: null,
          scale: null,
          length: 134_217_728,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "BINARY",
          text: "BINARY(67108864)",
          precision: null,
          scale: null,
          length: 67_108_864,
          vector_element_type: null,
          vector_dimension: null,
        },
      ],
    );
  });

  it("accepts current Snowflake VARCHAR/BINARY maxima and rejects one above each", () => {
    for (const [type, maximum] of [
      ["VARCHAR", 134_217_728],
      ["BINARY", 67_108_864],
    ]) {
      const accepted = diagramToCanonicalProject(
        singleFieldDiagram(type, maximum, `${type}_MAX`),
      );
      assert.equal(
        accepted.physical_model.tables[0].columns[0].data_type.length,
        maximum,
        `${type} current maximum must remain representable`,
      );
      assert.throws(
        () =>
          diagramToCanonicalProject(
            singleFieldDiagram(type, maximum + 1, `${type}_OVER_MAX`),
          ),
        /between 1 and|maximum|bound/i,
        `${type} values above the current maximum must reject`,
      );
    }
  });

  it("accepts bare BINARY as the canonical default length 8388608", () => {
    const project = diagramToCanonicalProject(singleFieldDiagram("BINARY", ""));
    assert.deepEqual(project.physical_model.tables[0].columns[0].data_type, {
      family: "BINARY",
      text: "BINARY(8388608)",
      precision: null,
      scale: null,
      length: 8_388_608,
      vector_element_type: null,
      vector_dimension: null,
    });
  });

  it("canonicalizes representative Snowflake aliases in DDL input", () => {
    // Canonical expectations: DECIMAL/INT -> NUMBER(38, 0), CHAR ->
    // VARCHAR(1), TEXT -> VARCHAR(16777216), VARBINARY -> BINARY(8388608),
    // DOUBLE PRECISION -> FLOAT, and TIMESTAMP -> TIMESTAMP_NTZ(9).
    const project = parseSnowflakeDDLToCanonicalProject(`
      CREATE TABLE ANALYTICS.CORE.ALIASES (
        DECIMAL_VALUE DECIMAL,
        INT_VALUE INT,
        CHAR_VALUE CHAR,
        TEXT_VALUE TEXT,
        VARBINARY_VALUE VARBINARY,
        DOUBLE_VALUE DOUBLE PRECISION,
        TIMESTAMP_VALUE TIMESTAMP
      );
    `, { name: "ALIASES" });
    assert.deepEqual(
      project.physical_model.tables[0].columns.map((column) => column.data_type),
      [
        {
          family: "NUMBER",
          text: "NUMBER(38, 0)",
          precision: 38,
          scale: 0,
          length: null,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "NUMBER",
          text: "NUMBER(38, 0)",
          precision: 38,
          scale: 0,
          length: null,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "VARCHAR",
          text: "VARCHAR(1)",
          precision: null,
          scale: null,
          length: 1,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "VARCHAR",
          text: "VARCHAR(16777216)",
          precision: null,
          scale: null,
          length: 16_777_216,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "BINARY",
          text: "BINARY(8388608)",
          precision: null,
          scale: null,
          length: 8_388_608,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "FLOAT",
          text: "FLOAT",
          precision: null,
          scale: null,
          length: null,
          vector_element_type: null,
          vector_dimension: null,
        },
        {
          family: "TIMESTAMP_NTZ",
          text: "TIMESTAMP_NTZ(9)",
          precision: 9,
          scale: null,
          length: null,
          vector_element_type: null,
          vector_dimension: null,
        },
      ],
    );
  });

  it("does not silently drop a legacy field.check; migrate it or reject it explicitly", () => {
    const fixture = cloneFixture(v1Fixtures.legacyFieldCheck);
    let project;
    try {
      project = diagramToCanonicalProject(fixture.diagram);
    } catch (error) {
      assert.equal(error?.code, fixture.expected.typedReject.code);
      assert.equal(error?.message, fixture.expected.typedReject.message);
      return;
    }
    const checks = project.physical_model.tables[0].check_constraints;
    assert.ok(
      Array.isArray(checks),
      "legacy field.check requires an explicit table-level migration",
    );
    assert.ok(
      checks.some((check) => check.expression === fixture.expected.expression),
      "legacy field.check expression must survive explicit migration",
    );
  });
});
