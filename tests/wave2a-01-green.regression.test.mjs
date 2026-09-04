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
} from "../src/erdTool/desktopBridge.js";
import { cloneFixture, v1Fixtures } from "./wave2a-01-fixtures.mjs";
import {
  assertSemanticEqual,
  semanticModel,
} from "./wave2a-01-parity.mjs";

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

  it("migrates the supported v1 fixture without guessing", () => {
    const fixture = cloneFixture(v1Fixtures.nonVectorMigration);
    assert.equal(fixture.version, "v1");
    assert.deepEqual(fixture.expected, {
      exportable: true,
      status: "supported",
    });

    const project = diagramToCanonicalProject(fixture.diagram);
    const ddl = renderCanonicalSnowflakeDDL(project);
    const reopened = canonicalProjectToDiagram(
      parseSnowflakeDDLToCanonicalProject(ddl, {
        name: project.physical_model.name,
      }),
    );

    assert.equal(reopened.database, undefined);
    assert.equal(reopened.tables[0].name, "EVENTS");
    assert.deepEqual(
      semanticModel(project).tables[0].columns.map((column) => ({
        name: column.name,
        type: column.dataType,
        nullable: column.nullable,
        default: column.default,
        comment: column.comment,
        check: column.check,
      })),
      [
        {
          name: "EVENT_ID",
          type: {
            family: "NUMBER",
            text: "NUMBER(38, 0)",
            precision: 38,
            scale: 0,
            length: null,
            vectorElement: null,
            vectorDimension: null,
          },
          nullable: false,
          default: null,
          comment: "Stable event id",
          check: null,
        },
        {
          name: "LABEL",
          type: {
            family: "VARCHAR",
            text: "VARCHAR(320)",
            precision: null,
            scale: null,
            length: 320,
            vectorElement: null,
            vectorDimension: null,
          },
          nullable: true,
          default: null,
          comment: "Human label",
          check: null,
        },
      ],
    );
  });

  it("enforces Snowflake type bounds at both exact maxima and just above them", () => {
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

    for (const [type, size] of [
      ["VARCHAR", 16_777_217],
      ["BINARY", 8_388_609],
    ]) {
      assert.throws(
        () =>
          diagramToCanonicalProject({
            database: "snowflake",
            title: "OUT_OF_BOUNDS",
            tables: [
              {
                id: "out-of-bounds",
                name: "OUT_OF_BOUNDS",
                x: 0,
                y: 0,
                fields: [
                  {
                    ...fields[0],
                    id: "bad-bound",
                    name: "VALUE",
                    type,
                    size,
                  },
                ],
              },
            ],
            relationships: [],
            transform: { pan: { x: 0, y: 0 }, zoom: 1 },
          }),
        /between 1 and/i,
      );
    }
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
