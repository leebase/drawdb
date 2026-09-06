import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyLogicalModel,
  diagramToLogicalModel,
  diffLogicalModels,
  validateLogicalModel,
} from "../src/erdTool/logicalModel.js";

function snowflakeDiagram() {
  return {
    database: "snowflake",
    tables: [
      {
        id: "customer",
        name: "CUSTOMER",
        x: 120,
        y: 80,
        locked: false,
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        fields: [
          {
            id: "customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER",
            size: "38,0",
            primary: true,
            unique: false,
            notNull: true,
            default: "",
            comment: "",
          },
        ],
        comment: "Customers",
        indices: [],
        uniqueConstraints: [],
        color: "#175e7a",
        collapsed: false,
      },
    ],
    relationships: [],
  };
}

function proposedModel() {
  return {
    summary: "Add customer email and orders",
    tables: [
      {
        key: "customer",
        name: "CUSTOMER",
        comment: "Customer accounts",
        columns: [
          {
            key: "customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: true,
            unique: false,
            default: "",
            comment: "",
          },
          {
            key: "new:customer-email",
            name: "EMAIL",
            type: "VARCHAR(320)",
            nullable: false,
            primary: false,
            unique: true,
            default: "",
            comment: "Login email",
          },
        ],
      },
      {
        key: "new:orders",
        name: "ORDER_HEADER",
        comment: "",
        columns: [
          {
            key: "new:order-id",
            name: "ORDER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: true,
            unique: false,
            default: "",
            comment: "",
          },
          {
            key: "new:order-customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER(38,0)",
            nullable: false,
            primary: false,
            unique: false,
            default: "",
            comment: "",
          },
        ],
      },
    ],
    relationships: [
      {
        key: "new:orders-customer",
        name: "FK_ORDER_CUSTOMER",
        sourceTableKey: "new:orders",
        sourceColumnKeys: ["new:order-customer-id"],
        targetTableKey: "customer",
        targetColumnKeys: ["customer-id"],
        cardinality: "many_to_one",
      },
    ],
  };
}

describe("SS-014 logical schema proposals", () => {
  it("projects a diagram into a credential-free strict logical model", () => {
    const model = diagramToLogicalModel(snowflakeDiagram());
    assert.equal(model.tables[0].key, "customer");
    assert.equal(model.tables[0].columns[0].type, "NUMBER(38,0)");
    assert.equal(JSON.stringify(model).includes("password"), false);
    assert.deepEqual(Object.keys(model).sort(), [
      "relationships",
      "summary",
      "tables",
    ]);
  });

  it("preserves existing ids and layout while applying accepted additions and changes", () => {
    let sequence = 0;
    const result = applyLogicalModel(snowflakeDiagram(), proposedModel(), {
      idFactory: (kind) => `${kind}-${++sequence}`,
    });
    assert.equal(result.tables.length, 2);
    assert.equal(result.tables[0].id, "customer");
    assert.equal(result.tables[0].x, 120);
    assert.equal(result.tables[0].y, 80);
    assert.equal(result.tables[0].comment, "Customer accounts");
    assert.equal(result.tables[0].fields[0].id, "customer-id");
    assert.equal(result.tables[0].fields[1].name, "EMAIL");
    assert.equal(result.tables[0].fields[1].unique, true);
    assert.deepEqual(result.tables[1].namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.equal(result.relationships.length, 1);
    assert.equal(
      result.relationships[0].startTableId,
      result.tables[1].id,
    );
    assert.equal(result.relationships[0].endTableId, "customer");
    assert.equal(
      result.relationships[0].fields[0].endFieldId,
      "customer-id",
    );
  });

  it("computes reviewable add/change/remove diffs before mutation", () => {
    const current = diagramToLogicalModel(snowflakeDiagram());
    const changes = diffLogicalModels(
      current,
      proposedModel(),
      "snowflake",
    );
    assert.deepEqual(
      changes.map(({ kind, object, label }) => ({ kind, object, label })),
      [
        { kind: "change", object: "table", label: "CUSTOMER" },
        { kind: "add", object: "table", label: "ORDER_HEADER" },
        {
          kind: "add",
          object: "relationship",
          label: "FK_ORDER_CUSTOMER",
        },
      ],
    );
  });

  it("fails closed for unknown fields, unsupported types, duplicates, and dangling references", () => {
    const unknown = proposedModel();
    unknown.secret = "do not accept";
    assert.throws(
      () => validateLogicalModel(unknown, "snowflake"),
      /unexpected or missing fields/,
    );

    const unsupported = proposedModel();
    unsupported.tables[1].columns[0].type = "BLOB";
    assert.throws(
      () => validateLogicalModel(unsupported, "snowflake"),
      /unsupported snowflake type BLOB/,
    );

    const duplicate = proposedModel();
    duplicate.tables[1].name = "CUSTOMER";
    assert.throws(
      () => validateLogicalModel(duplicate, "snowflake"),
      /duplicate CUSTOMER/,
    );

    const dangling = proposedModel();
    dangling.relationships[0].targetColumnKeys = ["missing"];
    assert.throws(
      () => validateLogicalModel(dangling, "snowflake"),
      /unknown column/,
    );

    const invalidRelationshipName = proposedModel();
    invalidRelationshipName.relationships[0].name = "fk_order_customer";
    assert.throws(
      () => validateLogicalModel(invalidRelationshipName, "snowflake"),
      /uppercase/,
    );
  });

  it("drops retained indexes or unique constraints when their columns are removed", () => {
    const diagram = snowflakeDiagram();
    diagram.tables[0].indices = [
      {
        id: "idx-customer-id",
        name: "IDX_CUSTOMER_ID",
        unique: false,
        fields: ["customer-id"],
      },
    ];
    diagram.tables[0].uniqueConstraints = [
      {
        id: "uq-customer-id",
        name: "UQ_CUSTOMER_ID",
        fields: ["customer-id"],
      },
    ];
    const proposal = proposedModel();
    proposal.tables[0].columns = [proposal.tables[0].columns[1]];
    proposal.relationships = [];

    const result = applyLogicalModel(diagram, proposal, {
      idFactory: (kind, key) => `${kind}:${key}`,
    });

    assert.deepEqual(result.tables[0].indices, []);
    assert.deepEqual(result.tables[0].uniqueConstraints, []);
  });
});

describe("Snowflake logical model type validation boundary", () => {
  // OBSERVED BEHAVIOR DOCUMENTATION:
  // src/erdTool/logicalModel.js validates column types via supportedType(column.type, database, label):
  // 1. Syntax matching: regex /^([A-Z][A-Z0-9_]*)(?:\(\s*([0-9]+(?:\s*,\s*[0-9]+)?)\s*\))?$/
  //    - Requires a single-word identifier (letters, digits, underscores).
  //    - Allows optional parentheses containing 1 or 2 numeric arguments.
  // 2. Family lookup: dbToTypes[database]?.[family] (dbToTypes.snowflake)
  //    - Snowflake recognizes all 16 canonical families: NUMBER, FLOAT, VARCHAR, DATE, TIME,
  //      TIMESTAMP_NTZ, TIMESTAMP_LTZ, TIMESTAMP_TZ, BOOLEAN, BINARY, VARIANT, OBJECT, ARRAY,
  //      GEOGRAPHY, GEOMETRY, VECTOR.
  //    - Snowflake also recognizes single-word aliases present in datatypes.js: INT, INTEGER, BIGINT,
  //      SMALLINT, TINYINT, BYTEINT, DECIMAL, NUMERIC, DOUBLE, REAL, STRING, TEXT, CHAR, DATETIME, TIMESTAMP.
  // 3. Normalization:
  //    - Trims and converts family to UPPERCASE.
  //    - Strips whitespace inside numeric arguments, returning `${family}(${args.replace(/\s+/g, "")})`.
  // 4. Differences from snowflakeTypeContract.js:
  //    - NO numeric bounds or range checking: e.g. NUMBER(99,99) or VARCHAR(99999999) is accepted by
  //      logicalModel without error, unlike validateSnowflakeType which enforces precision <= 38, scale <= precision,
  //      and length <= 16777216.
  //    - Non-numeric arguments rejected: VECTOR(INT, 16), OBJECT(a INT), ARRAY(VARCHAR) fail the regex
  //      because arguments must be numeric, throwing "is not a supported type expression".
  //      (Bare VECTOR, OBJECT, ARRAY succeed).
  //    - Multi-word type names rejected: DOUBLE PRECISION, TIMESTAMP WITHOUT TIME ZONE, etc. fail the regex
  //      due to space characters, throwing "is not a supported type expression".

  function makeProposalWithColumnType(type) {
    return {
      summary: `Test column type ${type}`,
      tables: [
        {
          key: "test-table",
          name: "TEST_TABLE",
          comment: "",
          columns: [
            {
              key: "test-column",
              name: "TEST_COLUMN",
              type,
              nullable: true,
              primary: false,
              unique: false,
              default: "",
              comment: "",
            },
          ],
        },
      ],
      relationships: [],
    };
  }

  const POSITIVE_TYPES = [
    // 16 canonical families in bare form
    { input: "NUMBER", expected: "NUMBER" },
    { input: "FLOAT", expected: "FLOAT" },
    { input: "VARCHAR", expected: "VARCHAR" },
    { input: "DATE", expected: "DATE" },
    { input: "TIME", expected: "TIME" },
    { input: "TIMESTAMP_NTZ", expected: "TIMESTAMP_NTZ" },
    { input: "TIMESTAMP_LTZ", expected: "TIMESTAMP_LTZ" },
    { input: "TIMESTAMP_TZ", expected: "TIMESTAMP_TZ" },
    { input: "BOOLEAN", expected: "BOOLEAN" },
    { input: "BINARY", expected: "BINARY" },
    { input: "VARIANT", expected: "VARIANT" },
    { input: "OBJECT", expected: "OBJECT" },
    { input: "ARRAY", expected: "ARRAY" },
    { input: "GEOGRAPHY", expected: "GEOGRAPHY" },
    { input: "GEOMETRY", expected: "GEOMETRY" },
    { input: "VECTOR", expected: "VECTOR" },

    // Canonical families with valid numeric parameters
    { input: "NUMBER(38,0)", expected: "NUMBER(38,0)" },
    { input: "NUMBER(10)", expected: "NUMBER(10)" },
    { input: "VARCHAR(16777216)", expected: "VARCHAR(16777216)" },
    { input: "VARCHAR(255)", expected: "VARCHAR(255)" },
    { input: "BINARY(8388608)", expected: "BINARY(8388608)" },
    { input: "TIME(9)", expected: "TIME(9)" },
    { input: "TIMESTAMP_NTZ(9)", expected: "TIMESTAMP_NTZ(9)" },
    { input: "TIMESTAMP_LTZ(9)", expected: "TIMESTAMP_LTZ(9)" },
    { input: "TIMESTAMP_TZ(9)", expected: "TIMESTAMP_TZ(9)" },

    // Single-word aliases present in dbToTypes.snowflake
    { input: "INT", expected: "INT" },
    { input: "INTEGER", expected: "INTEGER" },
    { input: "BIGINT", expected: "BIGINT" },
    { input: "SMALLINT", expected: "SMALLINT" },
    { input: "TINYINT", expected: "TINYINT" },
    { input: "BYTEINT", expected: "BYTEINT" },
    { input: "DECIMAL", expected: "DECIMAL" },
    { input: "DECIMAL(10,2)", expected: "DECIMAL(10,2)" },
    { input: "NUMERIC", expected: "NUMERIC" },
    { input: "NUMERIC(10,2)", expected: "NUMERIC(10,2)" },
    { input: "DOUBLE", expected: "DOUBLE" },
    { input: "REAL", expected: "REAL" },
    { input: "STRING", expected: "STRING" },
    { input: "TEXT", expected: "TEXT" },
    { input: "CHAR", expected: "CHAR" },
    { input: "CHAR(10)", expected: "CHAR(10)" },
    { input: "DATETIME", expected: "DATETIME" },
    { input: "TIMESTAMP", expected: "TIMESTAMP" },
    { input: "TIMESTAMP(9)", expected: "TIMESTAMP(9)" },

    // Spacing normalization within numeric arguments
    { input: "NUMBER(  38 ,  0  )", expected: "NUMBER(38,0)" },
    { input: "VARCHAR(  255  )", expected: "VARCHAR(255)" },

    // LogicalModel unvalidated bounds (differs from snowflakeTypeContract bounds validation)
    { input: "NUMBER(99,99)", expected: "NUMBER(99,99)" },
    { input: "VARCHAR(99999999)", expected: "VARCHAR(99999999)" },
  ];

  for (const { input, expected } of POSITIVE_TYPES) {
    it(`accepts valid or recognized logical column type: ${input}`, () => {
      const validated = validateLogicalModel(
        makeProposalWithColumnType(input),
        "snowflake",
      );
      assert.equal(validated.tables[0].columns[0].type, expected);
    });
  }

  const NEGATIVE_TYPES = [
    // Unsupported types (not present in dbToTypes.snowflake)
    { input: "BLOB", errorPattern: /uses unsupported snowflake type BLOB/ },
    { input: "CLOB", errorPattern: /uses unsupported snowflake type CLOB/ },
    { input: "UUID", errorPattern: /uses unsupported snowflake type UUID/ },
    { input: "FILE", errorPattern: /uses unsupported snowflake type FILE/ },
    { input: "MAP", errorPattern: /uses unsupported snowflake type MAP/ },
    { input: "DECFLOAT", errorPattern: /uses unsupported snowflake type DECFLOAT/ },

    // Multi-word types (rejected by supportedType single-word identifier regex)
    {
      input: "DOUBLE PRECISION",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "TIMESTAMP WITHOUT TIME ZONE",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "TIMESTAMP WITH LOCAL TIME ZONE",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "TIMESTAMP WITH TIME ZONE",
      errorPattern: /is not a supported type expression/,
    },

    // Non-numeric arguments (rejected by supportedType numeric-only argument regex)
    {
      input: "VECTOR(INT, 16)",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "VECTOR(FLOAT, 4)",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "OBJECT(a INT)",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "ARRAY(VARCHAR)",
      errorPattern: /is not a supported type expression/,
    },
    {
      input: "VARCHAR(abc)",
      errorPattern: /is not a supported type expression/,
    },

    // Malformed syntax
    { input: "NUMBER()", errorPattern: /is not a supported type expression/ },
    { input: "NUMBER(1,2,3)", errorPattern: /is not a supported type expression/ },
    { input: "NUMBER(-1)", errorPattern: /is not a supported type expression/ },
    { input: "NUMBER[38,0]", errorPattern: /is not a supported type expression/ },
    {
      input: "NUMBER; DROP TABLE T;",
      errorPattern: /is not a supported type expression/,
    },

    // Empty or blank
    { input: "", errorPattern: /must not be blank/ },
    { input: "   ", errorPattern: /must not be blank/ },
  ];

  for (const { input, errorPattern } of NEGATIVE_TYPES) {
    it(`rejects invalid or unsupported logical column type: "${input}"`, () => {
      assert.throws(
        () => validateLogicalModel(makeProposalWithColumnType(input), "snowflake"),
        errorPattern,
      );
    });
  }
});

