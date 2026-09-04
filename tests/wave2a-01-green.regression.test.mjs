import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  parseSnowflakeDDLToCanonicalProject,
  renderCanonicalSnowflakeDDL,
} from "../src/erdTool/projectAdapter.js";
import {
  exportDesktopSnowflakeDDL,
  openDesktopProject,
} from "../src/erdTool/desktopBridge.js";
import {
  cloneFixture,
  vectorFixtures,
  v1Fixtures,
} from "./wave2a-01-fixtures.mjs";
import { snowflakeMetadataToCanonicalProject } from "../src/erdTool/snowflakeMetadata.js";
import {
  assertSemanticEqual,
} from "./wave2a-01-parity.mjs";

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

function vectorField(size) {
  return {
    id: "vector-value",
    name: "VALUE",
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

function metadataColumn(table, name, dataType, ordinal, overrides = {}) {
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

function acceptedCoreTypesDiagram() {
  return {
    database: "snowflake",
    title: "CORE_TYPES",
    tables: [
      {
        id: "core-types",
        name: "CORE_TYPES",
        x: 20,
        y: 40,
        comment: "Accepted Snowflake core types",
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        fields: [
          {
            id: "amount",
            name: "AMOUNT",
            type: "NUMBER",
            size: "12,2",
            default: "0",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Amount",
          },
          {
            id: "label",
            name: "LABEL",
            type: "VARCHAR",
            size: 320,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "Label",
          },
          {
            id: "at-time",
            name: "AT_TIME",
            type: "TIME",
            size: 3,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "Wall-clock time",
          },
          {
            id: "created-at",
            name: "CREATED_AT",
            type: "TIMESTAMP_NTZ",
            size: 6,
            default: "CURRENT_TIMESTAMP()",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Creation timestamp",
          },
          {
            id: "local-at",
            name: "LOCAL_AT",
            type: "TIMESTAMP_LTZ",
            size: 9,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "Local timestamp",
          },
          {
            id: "offset-at",
            name: "OFFSET_AT",
            type: "TIMESTAMP_TZ",
            size: 0,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: false,
            increment: false,
            comment: "Offset timestamp",
          },
        ],
      },
    ],
    relationships: [],
    transform: { pan: { x: 7, y: 11 }, zoom: 1.1 },
  };
}

function keySemanticsDiagram() {
  return {
    database: "snowflake",
    title: "KEY_SEMANTICS",
    tables: [
      {
        id: "parent",
        name: "PARENT",
        x: 20,
        y: 40,
        comment: "Parent table",
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        fields: [
          {
            id: "parent-id",
            name: "PARENT_ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
          {
            id: "tenant-id",
            name: "TENANT_ID",
            type: "NUMBER",
            size: "12,0",
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
          {
            id: "parent-code",
            name: "PARENT_CODE",
            type: "VARCHAR",
            size: 64,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
        ],
        uniqueConstraints: [
          {
            id: "parent-unique",
            name: "UQ_PARENT_TENANT_CODE",
            fields: ["TENANT_ID", "PARENT_CODE"],
          },
        ],
      },
      {
        id: "child",
        name: "CHILD",
        x: 360,
        y: 40,
        comment: "Child table",
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        fields: [
          {
            id: "child-id",
            name: "CHILD_ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
          {
            id: "child-tenant-id",
            name: "TENANT_ID",
            type: "NUMBER",
            size: "12,0",
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
          {
            id: "child-code",
            name: "PARENT_CODE",
            type: "VARCHAR",
            size: 64,
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "",
          },
        ],
      },
    ],
    relationships: [
      {
        id: "child-parent",
        name: "FK_CHILD_PARENT",
        startTableId: "child",
        endTableId: "parent",
        startFieldId: "child-tenant-id",
        endFieldId: "tenant-id",
        fields: [
          { startFieldId: "child-tenant-id", endFieldId: "tenant-id" },
          { startFieldId: "child-code", endFieldId: "parent-code" },
        ],
        cardinality: "many_to_one",
        updateConstraint: "No action",
        deleteConstraint: "No action",
      },
    ],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

describe("Wave 2A accepted Snowflake regressions", () => {
  it("round-trips NUMBER, VARCHAR, TIME, and timestamp parameters and values", () => {
    const original = diagramToCanonicalProject(acceptedCoreTypesDiagram());
    const ddl = renderCanonicalSnowflakeDDL(original);
    const imported = parseSnowflakeDDLToCanonicalProject(ddl, {
      name: original.physical_model.name,
    });

    assertSemanticEqual(assert, imported, original);
    assert.match(ddl, /AMOUNT NUMBER\(12, 2\) NOT NULL DEFAULT 0/);
    assert.match(ddl, /LABEL VARCHAR\(320\)/);
    assert.match(ddl, /AT_TIME TIME\(3\)/);
    assert.match(ddl, /CREATED_AT TIMESTAMP_NTZ\(6\) NOT NULL DEFAULT CURRENT_TIMESTAMP\(\)/);
    assert.match(ddl, /LOCAL_AT TIMESTAMP_LTZ\(9\)/);
    assert.match(ddl, /OFFSET_AT TIMESTAMP_TZ\(0\)/);
  });

  it("rejects unsupported VECTOR element types and invalid dimensions", () => {
    for (const fixture of vectorFixtures.invalid) {
      assert.throws(
        () =>
          diagramToCanonicalProject({
            database: "snowflake",
            title: "INVALID_VECTOR",
            tables: [
              {
                id: "invalid-vector-table",
                name: "INVALID_VECTOR",
                x: 0,
                y: 0,
                fields: [vectorField(fixture.size)],
              },
            ],
            relationships: [],
            transform: { pan: { x: 0, y: 0 }, zoom: 1 },
          }),
        /VECTOR|element|dimension|unsupported|parameter/i,
        fixture.reason,
      );
    }
  });

  it("preserves ordered PK, composite UNIQUE, and composite FK semantics", () => {
    const original = diagramToCanonicalProject(keySemanticsDiagram());
    const imported = parseSnowflakeDDLToCanonicalProject(
      renderCanonicalSnowflakeDDL(original),
      { name: original.physical_model.name },
    );

    assertSemanticEqual(assert, imported, original);

    const parent = imported.physical_model.tables.find(
      (table) => table.name === "PARENT",
    );
    const child = imported.physical_model.tables.find(
      (table) => table.name === "CHILD",
    );
    assert.deepEqual(
      parent.constraints.find((constraint) => constraint.kind === "unique")
        .columns,
      [
        "column:ANALYTICS.CORE.PARENT.TENANT_ID",
        "column:ANALYTICS.CORE.PARENT.PARENT_CODE",
      ],
    );
    assert.deepEqual(
      child.constraints.find((constraint) => constraint.kind === "foreign_key")
        .columns,
      [
        "column:ANALYTICS.CORE.CHILD.TENANT_ID",
        "column:ANALYTICS.CORE.CHILD.PARENT_CODE",
      ],
    );
    assert.deepEqual(
      child.constraints.find((constraint) => constraint.kind === "foreign_key")
        .referenced_columns,
      [
        "column:ANALYTICS.CORE.PARENT.TENANT_ID",
        "column:ANALYTICS.CORE.PARENT.PARENT_CODE",
      ],
    );
  });

  it("opens and migrates a serialized canonical project_version/model_version v1 fixture", async () => {
    const fixture = cloneFixture(v1Fixtures.nonVectorMigration);
    assert.equal(fixture.serialized.project_version, "1");
    assert.equal(fixture.serialized.physical_model.model_version, "1");
    assert.deepEqual(fixture.expected, {
      exportable: true,
      status: "supported",
    });

    const opened = await openSerializedProject(fixture.serialized);
    assert.equal(opened.canceled, false);
    assert.equal(opened.diagram.tables[0].name, "EVENTS");
    const project = diagramToCanonicalProject(opened.diagram);
    assertSemanticEqual(assert, project, fixture.serialized);
    const ddl = renderCanonicalSnowflakeDDL(project);
    const reopenedProject = parseSnowflakeDDLToCanonicalProject(ddl, {
      name: project.physical_model.name,
    });
    assertSemanticEqual(assert, reopenedProject, project);
    assert.equal(canonicalProjectToDiagram(reopenedProject).tables[0].name, "EVENTS");
  });

  it("retains accepted legacy VARCHAR/BINARY maxima", () => {
    const fields = [
      ["VARCHAR_MIN", "VARCHAR", 1],
      ["VARCHAR_MAX", "VARCHAR", 16_777_216],
      ["BINARY_MIN", "BINARY", 1],
      ["BINARY_MAX", "BINARY", 8_388_608],
    ].map(([name, type, size], index) => ({
      id: `bound-${index}`,
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
    }));

    const model = diagramToCanonicalProject({
      database: "snowflake",
      title: "TYPE_BOUNDS",
      tables: [
        {
          id: "bounds",
          name: "TYPE_BOUNDS",
          x: 0,
          y: 0,
          fields,
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    });
    const columns = model.physical_model.tables[0].columns;
    assert.equal(columns[1].data_type.length, 16_777_216);
    assert.equal(columns[3].data_type.length, 8_388_608);
  });

  it("retains current VARCHAR/BINARY metadata maxima and bare defaults", () => {
    const metadata = {
      schemata: [
        { catalog_name: "ANALYTICS", schema_name: "CORE", schema_comment: null },
      ],
      tables: [
        {
          table_catalog: "ANALYTICS",
          table_schema: "CORE",
          table_name: "DEFAULT_BOUNDS",
          table_type: "BASE TABLE",
          comment: null,
        },
      ],
      columns: [
        metadataColumn("DEFAULT_BOUNDS", "TEXT_VALUE", "VARCHAR", 1),
        metadataColumn("DEFAULT_BOUNDS", "BINARY_VALUE", "BINARY", 2),
      ],
      tableConstraints: [],
      keyColumnUsage: [],
      referentialConstraints: [],
    };
    const columns = snowflakeMetadataToCanonicalProject(metadata, {
      name: "DEFAULT_BOUNDS",
    }).physical_model.tables[0].columns;
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

  it("saves Snowflake DDL without exposing a renderer execution path", async () => {
    const originalWindow = globalThis.window;
    const calls = { save: [], execute: 0 };
    const ddl = "CREATE TABLE ANALYTICS.CORE.SAFE (ID NUMBER(38, 0));";

    try {
      globalThis.window = {
        drawdbDesktop: {
          ddlExport: {
            save: async (request) => {
              calls.save.push(request);
              return { canceled: false, filePath: "/tmp/safe.sql" };
            },
          },
          // A legacy execution property is deliberately a trap.  The native
          // preview/save bridge must not read or call it.
          snowflake: {
            executeDdl: async () => {
              calls.execute += 1;
              throw new Error("renderer-controlled execution was invoked");
            },
          },
        },
      };

      const result = await exportDesktopSnowflakeDDL(
        { database: "snowflake", title: "SAFE" },
        ddl,
      );

      assert.deepEqual(result, {
        canceled: false,
        filePath: "/tmp/safe.sql",
      });
      assert.deepEqual(calls.save, [
        { contents: ddl, suggestedName: "SAFE.sql" },
      ]);
      assert.equal(calls.execute, 0);
    } finally {
      if (originalWindow === undefined) {
        delete globalThis.window;
      } else {
        globalThis.window = originalWindow;
      }
    }
  });
});
