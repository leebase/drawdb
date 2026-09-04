import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  diagramToCanonicalProject,
  parseSnowflakeDDLToCanonicalProject,
  renderCanonicalSnowflakeDDL,
} from "../src/erdTool/projectAdapter.js";
import {
  snowflakeMetadataToCanonicalProject,
  snowflakeMetadataToDiagram,
} from "../src/erdTool/snowflakeMetadata.js";
import { createSnowflakeService } from "../src/electron/snowflakeService.js";
import { cloneFixture, vectorFixtures, v1Fixtures } from "./wave2a-01-fixtures.mjs";
import {
  assertSemanticEqual,
  semanticModel,
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
            check: "AMOUNT >= 0",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Non-negative amount",
          },
        ],
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

function renderedColumnCheck(ddl, columnName) {
  const line = ddl
    .split("\n")
    .find((candidate) => candidate.trimStart().startsWith(`${columnName} `));
  if (!line) return null;
  return line.match(/\bCHECK\s*\((.*)\)\s*$/i)?.[1] ?? null;
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
    tableConstraints: [
      {
        table_catalog: "ANALYTICS",
        table_schema: "CORE",
        table_name: "CHECKED",
        constraint_catalog: "ANALYTICS",
        constraint_schema: "CORE",
        constraint_name: "CK_CHECKED_SCORE",
        constraint_type: "CHECK",
      },
    ],
    checkConstraints: [
      {
        constraint_catalog: "ANALYTICS",
        constraint_schema: "CORE",
        constraint_name: "CK_CHECKED_SCORE",
        table_catalog: "ANALYTICS",
        table_schema: "CORE",
        table_name: "CHECKED",
        check_clause: "SCORE >= 0",
      },
    ],
    keyColumnUsage: [],
    referentialConstraints: [],
  };
}

function mockSnowflakeDriver({
  tableName = "CHECKED",
  columns = [metadataColumn(tableName, "SCORE", "NUMBER", 1)],
  tableConstraints = [],
  checkConstraints = [],
} = {}) {
  const observed = { queries: [], destroyed: 0 };
  const tableRows = [
    {
      TABLE_CATALOG: "ANALYTICS",
      TABLE_SCHEMA: "CORE",
      TABLE_NAME: tableName,
      TABLE_TYPE: "BASE TABLE",
      COMMENT: null,
    },
  ];

  function rowsFor(sqlText) {
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
    if (upper.includes(".CHECK_CONSTRAINTS")) return checkConstraints;
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
          complete(undefined, {}, rowsFor(sqlText));
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
  it("does not guess a valid DDL type for the unresolved bare VECTOR v1 fixture", () => {
    const fixture = cloneFixture(v1Fixtures.bareVector);
    assert.equal(fixture.version, "v1");
    assert.deepEqual(fixture.expected, {
      exportable: false,
      status: "unresolved",
      reason: "VECTOR requires an INT or FLOAT element type and a positive dimension",
    });

    // Either rejecting at the canonical boundary or rejecting at the renderer
    // is acceptable while the fixture remains unresolved; emitting DDL is not.
    assert.throws(
      () => renderCanonicalSnowflakeDDL(diagramToCanonicalProject(fixture.diagram)),
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
      })),
      [
        {
          family: "VECTOR",
          text: "VECTOR(INT, 3)",
          precision: null,
          scale: null,
          length: null,
        },
        {
          family: "VECTOR",
          text: "VECTOR(FLOAT, 1536)",
          precision: null,
          scale: null,
          length: null,
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

  it("rejects unsupported VECTOR element types and invalid dimensions", () => {
    for (const fixture of vectorFixtures.invalid) {
      assert.throws(
        () =>
          diagramToCanonicalProject(
            vectorDiagram([vectorField("invalid-vector", "VALUE", fixture.size)]),
          ),
        /VECTOR|element|dimension|unsupported|parameter/i,
        fixture.reason,
      );
    }
  });

  it("preserves a Snowflake CHECK from editor DTO through canonical model and DDL", () => {
    const project = diagramToCanonicalProject(checkDiagram());
    const column = project.physical_model.tables[0].columns[0];
    const ddl = renderCanonicalSnowflakeDDL(project);

    assert.deepEqual(
      {
        canonicalCheck: column.check ?? null,
        renderedCheck: renderedColumnCheck(ddl, "AMOUNT"),
      },
      {
        canonicalCheck: "AMOUNT >= 0",
        renderedCheck: "AMOUNT >= 0",
      },
    );
  });

  it("issues a CHECK_CONSTRAINTS metadata query during reverse engineering", async () => {
    const checkRow = {
      CONSTRAINT_CATALOG: "ANALYTICS",
      CONSTRAINT_SCHEMA: "CORE",
      CONSTRAINT_NAME: "CK_CHECKED_SCORE",
      TABLE_CATALOG: "ANALYTICS",
      TABLE_SCHEMA: "CORE",
      TABLE_NAME: "CHECKED",
      CHECK_CLAUSE: "SCORE >= 0",
    };
    const tableConstraint = {
      CONSTRAINT_CATALOG: "ANALYTICS",
      CONSTRAINT_SCHEMA: "CORE",
      CONSTRAINT_NAME: "CK_CHECKED_SCORE",
      TABLE_CATALOG: "ANALYTICS",
      TABLE_SCHEMA: "CORE",
      TABLE_NAME: "CHECKED",
      CONSTRAINT_TYPE: "CHECK",
    };
    const mock = mockSnowflakeDriver({
      tableConstraints: [tableConstraint],
      checkConstraints: [checkRow],
    });
    const service = await connectedService(mock);
    const metadata = await service.reverseEngineer({
      sessionId: "wave2a-session",
      database: "ANALYTICS",
      schema: "CORE",
      tables: ["CHECKED"],
    });

    assert.ok(
      mock.observed.queries.some(({ sqlText }) =>
        /\bCHECK_CONSTRAINTS\b/i.test(sqlText),
      ),
      "reverse engineering must query INFORMATION_SCHEMA.CHECK_CONSTRAINTS",
    );
    assert.deepEqual(metadata.checkConstraints, [
      {
        constraint_catalog: "ANALYTICS",
        constraint_schema: "CORE",
        constraint_name: "CK_CHECKED_SCORE",
        table_catalog: "ANALYTICS",
        table_schema: "CORE",
        table_name: "CHECKED",
        check_clause: "SCORE >= 0",
      },
    ]);
  });

  it("maps mocked CHECK_CONSTRAINTS rows into canonical and editor CHECK fields", () => {
    const metadata = checkMetadataFixture();
    const project = snowflakeMetadataToCanonicalProject(metadata, {
      name: "CHECKED",
    });
    const diagram = snowflakeMetadataToDiagram(metadata, { title: "CHECKED" });
    const canonicalColumn = project.physical_model.tables[0].columns[0];
    const editorColumn = diagram.tables[0].fields[0];

    assert.deepEqual(
      {
        canonicalCheck: canonicalColumn.check ?? null,
        editorCheck: editorColumn.check ?? null,
      },
      {
        canonicalCheck: "SCORE >= 0",
        editorCheck: "SCORE >= 0",
      },
    );
  });

  it("keeps VARCHAR/BINARY metadata maxima as explicit canonical defaults", () => {
    const metadata = checkMetadataFixture({
      columns: [
        metadataColumn("CHECKED", "TEXT_VALUE", "VARCHAR", 1),
        metadataColumn("CHECKED", "BINARY_VALUE", "BINARY", 2),
      ],
    });
    const project = snowflakeMetadataToCanonicalProject(metadata, {
      name: "DEFAULT_BOUNDS",
    });
    const columns = project.physical_model.tables[0].columns;

    assert.deepEqual(
      columns.map((column) => column.data_type),
      [
        {
          family: "VARCHAR",
          text: "VARCHAR(16777216)",
          precision: null,
          scale: null,
          length: 16_777_216,
        },
        {
          family: "BINARY",
          text: "BINARY(8388608)",
          precision: null,
          scale: null,
          length: 8_388_608,
        },
      ],
    );
  });

  it("preserves CHAR's length-one default while normalizing its alias", async () => {
    const tableName = "ALIASES";
    const mock = mockSnowflakeDriver({
      tableName,
      columns: [
        metadataColumn(tableName, "CHAR_VALUE", "CHAR", 1),
        metadataColumn(tableName, "TEXT_VALUE", "TEXT", 2),
        metadataColumn(tableName, "VARCHAR_VALUE", "VARCHAR", 3),
        metadataColumn(tableName, "BINARY_VALUE", "BINARY", 4),
        metadataColumn(tableName, "INT_VALUE", "INT", 5),
      ],
    });
    const service = await connectedService(mock);
    const metadata = await service.reverseEngineer({
      sessionId: "wave2a-session",
      database: "ANALYTICS",
      schema: "CORE",
      tables: [tableName],
    });
    const project = snowflakeMetadataToCanonicalProject(metadata, {
      name: "ALIASES",
    });
    const columns = Object.fromEntries(
      project.physical_model.tables[0].columns.map((column) => [
        column.name,
        column.data_type,
      ]),
    );

    assert.deepEqual(columns, {
      CHAR_VALUE: {
        family: "VARCHAR",
        text: "VARCHAR(1)",
        precision: null,
        scale: null,
        length: 1,
      },
      TEXT_VALUE: {
        family: "VARCHAR",
        text: "VARCHAR(16777216)",
        precision: null,
        scale: null,
        length: 16_777_216,
      },
      VARCHAR_VALUE: {
        family: "VARCHAR",
        text: "VARCHAR(16777216)",
        precision: null,
        scale: null,
        length: 16_777_216,
      },
      BINARY_VALUE: {
        family: "BINARY",
        text: "BINARY(8388608)",
        precision: null,
        scale: null,
        length: 8_388_608,
      },
      INT_VALUE: {
        family: "NUMBER",
        text: "NUMBER(38, 0)",
        precision: 38,
        scale: 0,
        length: null,
      },
    });
  });
});
