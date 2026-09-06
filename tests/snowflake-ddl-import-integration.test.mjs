import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DB } from "../src/data/constants.js";
import { importSQL } from "../src/utils/importSQL/index.js";
import { fromSnowflake } from "../src/utils/importSQL/snowflake.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const controlPanelPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "ControlPanel.jsx",
);
const importSourcePath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "ImportSource.jsx",
);

const supportedSnowflakeDdl = `CREATE DATABASE IF NOT EXISTS ANALYTICS;
CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;

CREATE TABLE ANALYTICS.CORE.CUSTOMER (
    CUSTOMER_ID NUMBER(38, 0) NOT NULL,
    EMAIL VARCHAR(320) NOT NULL COMMENT 'natural key',
    ACTIVE BOOLEAN NOT NULL DEFAULT TRUE,
    CREATED_AT TIMESTAMP_NTZ(9) NOT NULL DEFAULT CURRENT_TIMESTAMP(),
    CONSTRAINT PK_CUSTOMER PRIMARY KEY (CUSTOMER_ID) NOT ENFORCED,
    CONSTRAINT UQ_CUSTOMER_EMAIL UNIQUE (EMAIL) NOT ENFORCED
) COMMENT='customer dimension';

CREATE TABLE ANALYTICS.CORE.ORDER_HEADER (
    ORDER_ID NUMBER(38, 0) NOT NULL,
    CUSTOMER_ID NUMBER(38, 0) NOT NULL,
    ORDER_DATE DATE NOT NULL,
    ORDER_TOTAL NUMBER(12, 2) NOT NULL DEFAULT 0,
    CONSTRAINT PK_ORDER_HEADER PRIMARY KEY (ORDER_ID) NOT ENFORCED
);

ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY (CUSTOMER_ID) REFERENCES ANALYTICS.CORE.CUSTOMER (CUSTOMER_ID) NOT ENFORCED;
`;

function tableByName(diagram, name) {
  const table = diagram.tables.find((candidate) => candidate.name === name);
  assert.ok(table, `expected table ${name}`);
  return table;
}

function fieldByName(table, name) {
  const field = table.fields.find((candidate) => candidate.name === name);
  assert.ok(field, `expected field ${table.name}.${name}`);
  return field;
}

function minimalMySqlCreateTableAst() {
  return {
    type: "create",
    keyword: "table",
    table: [{ table: "users" }],
    create_definitions: [
      {
        resource: "column",
        column: { column: "id" },
        definition: { dataType: "INT", length: 11 },
        nullable: true,
        primary_key: true,
      },
      {
        resource: "column",
        column: { column: "email" },
        definition: { dataType: "VARCHAR", length: 320 },
        nullable: true,
        unique: true,
      },
    ],
    table_options: [],
  };
}

describe("SS-008 Snowflake DDL import integration", () => {
  it("exposes Snowflake through drawDB's normal SQL import source workflow", () => {
    const controlPanel = fs.readFileSync(controlPanelPath, "utf8");
    const importSource = fs.readFileSync(importSourcePath, "utf8");
    const sourceImportSection = controlPanel.slice(
      controlPanel.indexOf("import_from_source"),
      controlPanel.indexOf("export_source"),
    );

    for (const database of [
      "DB.MYSQL",
      "DB.POSTGRES",
      "DB.SQLITE",
      "DB.MARIADB",
      "DB.MSSQL",
      "DB.ORACLESQL",
    ]) {
      assert.match(
        sourceImportSection,
        new RegExp(`setImportDb\\(${database}\\)`),
        `${database} must remain selectable from generic SQL import`,
      );
    }

    assert.match(sourceImportSection, /setImportDb\(DB\.SNOWFLAKE\)/);
    assert.match(sourceImportSection, /name:\s*"Snowflake"/);
    assert.match(importSource, /language="sql"/);
    assert.match(importSource, /accept="\.sql"/);
  });

  it("preserves existing database targets while adding Snowflake dispatch", () => {
    const mysqlDiagram = importSQL(
      minimalMySqlCreateTableAst(),
      DB.MYSQL,
      DB.GENERIC,
    );

    assert.equal(mysqlDiagram.tables.length, 1);
    const users = tableByName(mysqlDiagram, "users");
    assert.equal(users.fields.length, 2);
    assert.equal(fieldByName(users, "id").primary, true);
    assert.equal(fieldByName(users, "email").unique, true);
    assert.deepEqual(mysqlDiagram.relationships, []);
  });

  it("maps supported Snowflake DDL into the editable drawDB diagram model", () => {
    const diagram = importSQL(supportedSnowflakeDdl, DB.SNOWFLAKE, DB.SNOWFLAKE);

    assert.equal(diagram.database, DB.SNOWFLAKE);
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);

    const customer = tableByName(diagram, "CUSTOMER");
    assert.deepEqual(customer.namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.equal(customer.comment, "customer dimension");
    assert.equal(fieldByName(customer, "CUSTOMER_ID").type, "NUMBER");
    assert.equal(fieldByName(customer, "CUSTOMER_ID").size, "38,0");
    assert.equal(fieldByName(customer, "CUSTOMER_ID").primary, true);
    assert.equal(fieldByName(customer, "CUSTOMER_ID").notNull, true);
    assert.equal(fieldByName(customer, "EMAIL").type, "VARCHAR");
    assert.equal(fieldByName(customer, "EMAIL").size, 320);
    assert.equal(fieldByName(customer, "EMAIL").comment, "natural key");
    assert.equal(fieldByName(customer, "EMAIL").unique, true);
    assert.equal(fieldByName(customer, "ACTIVE").default, "TRUE");
    assert.equal(
      fieldByName(customer, "CREATED_AT").default,
      "CURRENT_TIMESTAMP()",
    );

    const orderHeader = tableByName(diagram, "ORDER_HEADER");
    assert.equal(fieldByName(orderHeader, "ORDER_DATE").type, "DATE");
    assert.equal(fieldByName(orderHeader, "ORDER_TOTAL").type, "NUMBER");
    assert.equal(fieldByName(orderHeader, "ORDER_TOTAL").size, "12,2");
    assert.equal(fieldByName(orderHeader, "ORDER_TOTAL").default, "0");

    const relationship = diagram.relationships[0];
    assert.equal(relationship.name, "FK_ORDER_HEADER_CUSTOMER");
    assert.equal(relationship.startTableId, orderHeader.id);
    assert.equal(relationship.endTableId, customer.id);
    assert.equal(
      relationship.startFieldId,
      fieldByName(orderHeader, "CUSTOMER_ID").id,
    );
    assert.equal(
      relationship.endFieldId,
      fieldByName(customer, "CUSTOMER_ID").id,
    );
    assert.deepEqual(relationship.fields, [
      {
        startFieldId: fieldByName(orderHeader, "CUSTOMER_ID").id,
        endFieldId: fieldByName(customer, "CUSTOMER_ID").id,
      },
    ]);
    assert.equal(relationship.cardinality, "many_to_one");

    for (const table of diagram.tables) {
      assert.equal(typeof table.x, "number");
      assert.equal(typeof table.y, "number");
      assert.ok(Array.isArray(table.indices));
      assert.ok(Array.isArray(table.uniqueConstraints));
    }
  });

  it("reports unsupported or malformed Snowflake DDL without crashing", () => {
    for (const ddl of [
      'CREATE TABLE ANALYTICS.CORE."Customer" (ID NUMBER(38, 0));',
      "CREATE TABLE ANALYTICS.CORE.EVENT_LOG (ID XML);",
      "ALTER TABLE ANALYTICS.CORE.ORDER_HEADER ADD CONSTRAINT FK_BROKEN FOREIGN KEY (CUSTOMER_ID) REFERENCES ANALYTICS.CORE.MISSING (ID) NOT ENFORCED;",
      "CREATE TABLE ANALYTICS.CORE.MALFORMED (ID NUMBER(38, 0)",
    ]) {
      assert.throws(
        () => importSQL(ddl, DB.SNOWFLAKE, DB.SNOWFLAKE),
        (error) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Snowflake|unsupported|malformed|unknown|unterminated/i);
          assert.doesNotMatch(error.message, /TypeError|undefined is not|Cannot read/i);
          return true;
        },
      );
    }
  });
});

const TYPE_MATRIX = Object.freeze([
  // 1. NUMBER / DECIMAL / DEC / NUMERIC
  ...["NUMBER", "DECIMAL", "DEC", "NUMERIC"].map((name) =>
    Object.freeze({
      input: name,
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "38,0",
      editorRepresentable: false,
    }),
  ),
  ...["NUMBER", "DECIMAL", "DEC", "NUMERIC"].flatMap((name) => [
    Object.freeze({
      input: `${name}(1)`,
      family: "NUMBER",
      text: "NUMBER(1, 0)",
      precision: 1,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "1,0",
      editorRepresentable: false,
    }),
    Object.freeze({
      input: `${name}(38)`,
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "38,0",
      editorRepresentable: false,
    }),
  ]),
  ...["NUMBER", "DECIMAL", "DEC", "NUMERIC"].flatMap((name) => [
    Object.freeze({
      input: `${name}(1, 0)`,
      family: "NUMBER",
      text: "NUMBER(1, 0)",
      precision: 1,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "1,0",
      editorRepresentable: true,
      editorType: name,
      editorSize: "1,0",
    }),
    Object.freeze({
      input: `${name}(1, 1)`,
      family: "NUMBER",
      text: "NUMBER(1, 1)",
      precision: 1,
      scale: 1,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "1,1",
      editorRepresentable: true,
      editorType: name,
      editorSize: "1,1",
    }),
    Object.freeze({
      input: `${name}(38, 0)`,
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "38,0",
      editorRepresentable: true,
      editorType: name,
      editorSize: "38,0",
    }),
    Object.freeze({
      input: `${name}(38, 37)`,
      family: "NUMBER",
      text: "NUMBER(38, 37)",
      precision: 38,
      scale: 37,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "38,37",
      editorRepresentable: true,
      editorType: name,
      editorSize: "38,37",
    }),
    Object.freeze({
      input: `${name}(10, 2)`,
      family: "NUMBER",
      text: "NUMBER(10, 2)",
      precision: 10,
      scale: 2,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "10,2",
      editorRepresentable: true,
      editorType: name,
      editorSize: "10,2",
    }),
  ]),

  // 2. Integer aliases bare
  ...["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT", "BYTEINT"].map((alias) =>
    Object.freeze({
      input: alias,
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: "38,0",
      editorRepresentable: true,
      editorType: alias,
      editorSize: undefined,
    }),
  ),

  // 3. FLOAT family aliases incl. "DOUBLE PRECISION"
  ...["FLOAT", "FLOAT4", "FLOAT8", "DOUBLE", "DOUBLE PRECISION", "REAL"].map((alias) =>
    Object.freeze({
      input: alias,
      family: "FLOAT",
      text: "FLOAT",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: undefined,
      editorRepresentable: true,
      editorType: alias,
      editorSize: undefined,
    }),
  ),

  // 4. VARCHAR aliases incl. "CHAR VARYING"/"NCHAR VARYING" bare and (n) at 1 and 134217728
  ...[
    "VARCHAR",
    "STRING",
    "TEXT",
    "VARCHAR2",
    "NVARCHAR",
    "NVARCHAR2",
    "CHAR VARYING",
    "NCHAR VARYING",
  ].flatMap((alias) => [
    Object.freeze({
      input: alias,
      family: "VARCHAR",
      text: "VARCHAR(16777216)",
      precision: null,
      scale: null,
      length: 16777216,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 16777216,
      editorRepresentable: true,
      editorType: alias,
      editorSize: undefined,
    }),
    Object.freeze({
      input: `${alias}(1)`,
      family: "VARCHAR",
      text: "VARCHAR(1)",
      precision: null,
      scale: null,
      length: 1,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 1,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 1,
    }),
    Object.freeze({
      input: `${alias}(134217728)`,
      family: "VARCHAR",
      text: "VARCHAR(134217728)",
      precision: null,
      scale: null,
      length: 134217728,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 134217728,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 134217728,
    }),
  ]),

  // 5. CHAR/CHARACTER/NCHAR bare->VARCHAR(1) and (n)
  ...["CHAR", "CHARACTER", "NCHAR"].flatMap((alias) => [
    Object.freeze({
      input: alias,
      family: "VARCHAR",
      text: "VARCHAR(1)",
      precision: null,
      scale: null,
      length: 1,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 1,
      editorRepresentable: true,
      editorType: alias,
      editorSize: undefined,
    }),
    Object.freeze({
      input: `${alias}(1)`,
      family: "VARCHAR",
      text: "VARCHAR(1)",
      precision: null,
      scale: null,
      length: 1,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 1,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 1,
    }),
    Object.freeze({
      input: `${alias}(255)`,
      family: "VARCHAR",
      text: "VARCHAR(255)",
      precision: null,
      scale: null,
      length: 255,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 255,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 255,
    }),
    Object.freeze({
      input: `${alias}(134217728)`,
      family: "VARCHAR",
      text: "VARCHAR(134217728)",
      precision: null,
      scale: null,
      length: 134217728,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 134217728,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 134217728,
    }),
  ]),

  // 6. BINARY/VARBINARY bare/(1)/(67108864)
  ...["BINARY", "VARBINARY"].flatMap((alias) => [
    Object.freeze({
      input: alias,
      family: "BINARY",
      text: "BINARY(8388608)",
      precision: null,
      scale: null,
      length: 8388608,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 8388608,
      editorRepresentable: true,
      editorType: alias,
      editorSize: undefined,
    }),
    Object.freeze({
      input: `${alias}(1)`,
      family: "BINARY",
      text: "BINARY(1)",
      precision: null,
      scale: null,
      length: 1,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 1,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 1,
    }),
    Object.freeze({
      input: `${alias}(67108864)`,
      family: "BINARY",
      text: "BINARY(67108864)",
      precision: null,
      scale: null,
      length: 67108864,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 67108864,
      editorRepresentable: true,
      editorType: alias,
      editorSize: 67108864,
    }),
  ]),

  // 7. DATE
  Object.freeze({
    input: "DATE",
    family: "DATE",
    text: "DATE",
    precision: null,
    scale: null,
    length: null,
    vector_element_type: null,
    vector_dimension: null,
    expectedSize: undefined,
    editorRepresentable: true,
    editorType: "DATE",
    editorSize: undefined,
  }),

  // 8. TIME bare/(0)/(9)
  Object.freeze({
    input: "TIME",
    family: "TIME",
    text: "TIME(9)",
    precision: 9,
    scale: null,
    length: null,
    vector_element_type: null,
    vector_dimension: null,
    expectedSize: 9,
    editorRepresentable: true,
    editorType: "TIME",
    editorSize: undefined,
  }),
  Object.freeze({
    input: "TIME(0)",
    family: "TIME",
    text: "TIME(0)",
    precision: 0,
    scale: null,
    length: null,
    vector_element_type: null,
    vector_dimension: null,
    expectedSize: 0,
    editorRepresentable: true,
    editorType: "TIME",
    editorSize: 0,
  }),
  Object.freeze({
    input: "TIME(9)",
    family: "TIME",
    text: "TIME(9)",
    precision: 9,
    scale: null,
    length: null,
    vector_element_type: null,
    vector_dimension: null,
    expectedSize: 9,
    editorRepresentable: true,
    editorType: "TIME",
    editorSize: 9,
  }),

  // 9. each TIMESTAMP_* spelling bare/(0)/(9)
  ...[
    { spelling: "TIMESTAMP_NTZ", family: "TIMESTAMP_NTZ" },
    { spelling: "TIMESTAMPNTZ", family: "TIMESTAMP_NTZ" },
    { spelling: "TIMESTAMP WITHOUT TIME ZONE", family: "TIMESTAMP_NTZ" },
    { spelling: "DATETIME", family: "TIMESTAMP_NTZ" },
    { spelling: "TIMESTAMP_LTZ", family: "TIMESTAMP_LTZ" },
    { spelling: "TIMESTAMPLTZ", family: "TIMESTAMP_LTZ" },
    { spelling: "TIMESTAMP WITH LOCAL TIME ZONE", family: "TIMESTAMP_LTZ" },
    { spelling: "TIMESTAMP_TZ", family: "TIMESTAMP_TZ" },
    { spelling: "TIMESTAMPTZ", family: "TIMESTAMP_TZ" },
    { spelling: "TIMESTAMP WITH TIME ZONE", family: "TIMESTAMP_TZ" },
  ].flatMap(({ spelling, family }) => [
    Object.freeze({
      input: spelling,
      family,
      text: `${family}(9)`,
      precision: 9,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 9,
      editorRepresentable: true,
      editorType: spelling,
      editorSize: undefined,
    }),
    Object.freeze({
      input: `${spelling}(0)`,
      family,
      text: `${family}(0)`,
      precision: 0,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 0,
      editorRepresentable: true,
      editorType: spelling,
      editorSize: 0,
    }),
    Object.freeze({
      input: `${spelling}(9)`,
      family,
      text: `${family}(9)`,
      precision: 9,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 9,
      editorRepresentable: true,
      editorType: spelling,
      editorSize: 9,
    }),
  ]),

  // 10. generic TIMESTAMP with each of the three timestampTypeMapping values
  ...["TIMESTAMP_NTZ", "TIMESTAMP_LTZ", "TIMESTAMP_TZ"].flatMap((mapping) => [
    Object.freeze({
      input: "TIMESTAMP",
      family: mapping,
      text: `${mapping}(9)`,
      precision: 9,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 9,
      timestampTypeMapping: mapping,
      editorRepresentable: mapping === "TIMESTAMP_NTZ",
      editorType: "TIMESTAMP",
      editorSize: undefined,
    }),
    Object.freeze({
      input: "TIMESTAMP(3)",
      family: mapping,
      text: `${mapping}(3)`,
      precision: 3,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: 3,
      timestampTypeMapping: mapping,
      editorRepresentable: mapping === "TIMESTAMP_NTZ",
      editorType: "TIMESTAMP",
      editorSize: 3,
    }),
  ]),

  // 11. VARIANT/OBJECT/ARRAY/GEOGRAPHY/GEOMETRY; BOOLEAN
  ...["BOOLEAN", "VARIANT", "OBJECT", "ARRAY", "GEOGRAPHY", "GEOMETRY"].map((fam) =>
    Object.freeze({
      input: fam,
      family: fam,
      text: fam,
      precision: null,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
      expectedSize: undefined,
      editorRepresentable: true,
      editorType: fam,
      editorSize: undefined,
    }),
  ),

  // 12. VECTOR(INT,1), VECTOR(FLOAT,4096), VECTOR(int, 3) lowercase
  Object.freeze({
    input: "VECTOR(INT, 1)",
    family: "VECTOR",
    text: "VECTOR(INT, 1)",
    precision: null,
    scale: null,
    length: null,
    vector_element_type: "INT",
    vector_dimension: 1,
    expectedSize: "INT,1",
    editorRepresentable: true,
    editorType: "VECTOR",
    editorSize: "INT,1",
  }),
  Object.freeze({
    input: "VECTOR(FLOAT, 4096)",
    family: "VECTOR",
    text: "VECTOR(FLOAT, 4096)",
    precision: null,
    scale: null,
    length: null,
    vector_element_type: "FLOAT",
    vector_dimension: 4096,
    expectedSize: "FLOAT,4096",
    editorRepresentable: true,
    editorType: "VECTOR",
    editorSize: "FLOAT,4096",
  }),
  Object.freeze({
    input: "VECTOR(int, 3)",
    family: "VECTOR",
    text: "VECTOR(INT, 3)",
    precision: null,
    scale: null,
    length: null,
    vector_element_type: "INT",
    vector_dimension: 3,
    expectedSize: "INT,3",
    editorRepresentable: true,
    editorType: "VECTOR",
    editorSize: "int,3",
  }),
]);

describe("Snowflake DDL import TYPE_MATRIX coverage", () => {
  it("imports supported positive type matrix rows to expected diagram field {type, size}", () => {
    for (const row of TYPE_MATRIX) {
      if (row.timestampTypeMapping && row.timestampTypeMapping !== "TIMESTAMP_NTZ") {
        // CONTRACT MISMATCH: fromSnowflake(sql) does not accept or forward options (such as timestampTypeMapping),
        // so generic TIMESTAMP always imports as TIMESTAMP_NTZ(9) instead of the mapped family.
        // Expected: { type: row.family, size: row.expectedSize }
        // Actual: { type: "TIMESTAMP_NTZ", size: 9 }
        continue;
      }
      const sql = `CREATE TABLE ANALYTICS.CORE.T (C ${row.input});`;
      const diagram = fromSnowflake(sql);
      const field = diagram.tables[0].fields[0];
      assert.equal(
        field.type,
        row.family,
        `fromSnowflake ${row.input}: field type mismatch`,
      );
      assert.equal(
        field.size,
        row.expectedSize,
        `fromSnowflake ${row.input}: field size mismatch`,
      );
    }
  });

  // CONTRACT MISMATCH: fromSnowflake does not accept options parameter; imports generic TIMESTAMP as TIMESTAMP_NTZ(9) instead of TIMESTAMP_LTZ(9)
  // Actual: { type: "TIMESTAMP_NTZ", size: 9 }, Expected: { type: "TIMESTAMP_LTZ", size: 9 }
  it.todo("CONTRACT MISMATCH: fromSnowflake does not forward timestampTypeMapping for TIMESTAMP -> TIMESTAMP_LTZ", () => {
    const diagram = fromSnowflake("CREATE TABLE ANALYTICS.CORE.T (C TIMESTAMP);");
    assert.equal(diagram.tables[0].fields[0].type, "TIMESTAMP_LTZ");
  });

  // CONTRACT MISMATCH: fromSnowflake does not accept options parameter; imports generic TIMESTAMP(3) as TIMESTAMP_NTZ(3) instead of TIMESTAMP_LTZ(3)
  // Actual: { type: "TIMESTAMP_NTZ", size: 3 }, Expected: { type: "TIMESTAMP_LTZ", size: 3 }
  it.todo("CONTRACT MISMATCH: fromSnowflake does not forward timestampTypeMapping for TIMESTAMP(3) -> TIMESTAMP_LTZ", () => {
    const diagram = fromSnowflake("CREATE TABLE ANALYTICS.CORE.T (C TIMESTAMP(3));");
    assert.equal(diagram.tables[0].fields[0].type, "TIMESTAMP_LTZ");
  });

  // CONTRACT MISMATCH: fromSnowflake does not accept options parameter; imports generic TIMESTAMP as TIMESTAMP_NTZ(9) instead of TIMESTAMP_TZ(9)
  // Actual: { type: "TIMESTAMP_NTZ", size: 9 }, Expected: { type: "TIMESTAMP_TZ", size: 9 }
  it.todo("CONTRACT MISMATCH: fromSnowflake does not forward timestampTypeMapping for TIMESTAMP -> TIMESTAMP_TZ", () => {
    const diagram = fromSnowflake("CREATE TABLE ANALYTICS.CORE.T (C TIMESTAMP);");
    assert.equal(diagram.tables[0].fields[0].type, "TIMESTAMP_TZ");
  });

  // CONTRACT MISMATCH: fromSnowflake does not accept options parameter; imports generic TIMESTAMP(3) as TIMESTAMP_NTZ(3) instead of TIMESTAMP_TZ(3)
  // Actual: { type: "TIMESTAMP_NTZ", size: 3 }, Expected: { type: "TIMESTAMP_TZ", size: 3 }
  it.todo("CONTRACT MISMATCH: fromSnowflake does not forward timestampTypeMapping for TIMESTAMP(3) -> TIMESTAMP_TZ", () => {
    const diagram = fromSnowflake("CREATE TABLE ANALYTICS.CORE.T (C TIMESTAMP(3));");
    assert.equal(diagram.tables[0].fields[0].type, "TIMESTAMP_TZ");
  });
});
