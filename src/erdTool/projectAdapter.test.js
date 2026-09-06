import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  parseSnowflakeDDLToCanonicalProject,
  renderCanonicalSnowflakeDDL,
  renderCanonicalSnowflakeStatements,
  toSnowflakeIdentifier,
} from "./projectAdapter.js";
import { snowflakeTypeFromField } from "./snowflakeTypeContract.js";

function twoTableProject(overrides = {}) {
  const physical_model = {
    model_version: "1",
    name: "demo-model",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "CUSTOMER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
            name: "CUSTOMER_NAME",
            ordinal: 2,
            data_type: {
              family: "VARCHAR",
              text: "VARCHAR(200)",
              precision: null,
              scale: null,
              length: 200,
            },
            nullable: false,
            default: null,
            comment: "display name",
          },
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
            name: "EMAIL",
            ordinal: 3,
            data_type: {
              family: "VARCHAR",
              text: "VARCHAR(320)",
              precision: null,
              scale: null,
              length: 320,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
            name: "PK_CUSTOMER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
          {
            id: "constraint:ANALYTICS.CORE.CUSTOMER.UQ_CUSTOMER_EMAIL",
            name: "UQ_CUSTOMER_EMAIL",
            kind: "unique",
            columns: ["column:ANALYTICS.CORE.CUSTOMER.EMAIL"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.CORE.ORDER_HEADER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "ORDER_HEADER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.ORDER_HEADER.ORDER_ID",
            name: "ORDER_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.ORDER_HEADER.ORDER_DATE",
            name: "ORDER_DATE",
            ordinal: 3,
            data_type: {
              family: "DATE",
              text: "DATE",
              precision: null,
              scale: null,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
            name: "FK_ORDER_HEADER_CUSTOMER",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
            referenced_columns: [
              "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            ],
          },
          {
            id: "constraint:ANALYTICS.CORE.ORDER_HEADER.PK_ORDER_HEADER",
            name: "PK_ORDER_HEADER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.ORDER_HEADER.ORDER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.CORE.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
        name: "FK_ORDER_HEADER_CUSTOMER",
        source_table_id: "table:ANALYTICS.CORE.ORDER_HEADER",
        source_column_ids: [
          "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
        ],
        target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
        target_column_ids: [
          "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
        ],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 40, y: 80 },
        "table:ANALYTICS.CORE.ORDER_HEADER": { x: 360, y: 120 },
      },
      viewport: { x: 10, y: 20, zoom: 1.25 },
    },
    ...overrides,
  };
}

describe("toSnowflakeIdentifier", () => {
  it("normalizes legal unquoted Snowflake identifiers", () => {
    assert.equal(toSnowflakeIdentifier("customer"), "CUSTOMER");
    assert.equal(toSnowflakeIdentifier(" order-header "), "_ORDER_HEADER_");
    assert.equal(toSnowflakeIdentifier("123bad"), "_123BAD");
    assert.equal(toSnowflakeIdentifier("a$b"), "A$B");
  });

  it("maps every source character without trimming; spaces and NBSP become underscores", () => {
    assert.equal(toSnowflakeIdentifier(" A "), "_A_");
    assert.equal(toSnowflakeIdentifier("\u00A0Straße\u00A0"), "_STRA_E_");
    assert.equal(toSnowflakeIdentifier("Straße"), "STRA_E");
    assert.equal(toSnowflakeIdentifier("Strasse"), "STRASSE");
  });

  it("fails on empty normalization", () => {
    assert.throws(() => toSnowflakeIdentifier(""), /empty|identifier/i);
  });
});

describe("canonicalProjectToDiagram", () => {
  it("imports a two-table canonical project with stable ids and field flags", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());

    assert.equal(diagram.title, "demo-model");
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);

    const customer = diagram.tables.find(
      (t) => t.id === "table:ANALYTICS.CORE.CUSTOMER",
    );
    const order = diagram.tables.find(
      (t) => t.id === "table:ANALYTICS.CORE.ORDER_HEADER",
    );
    assert.ok(customer);
    assert.ok(order);
    assert.equal(customer.x, 40);
    assert.equal(customer.y, 80);
    assert.equal(order.x, 360);
    assert.equal(order.y, 120);

    const idField = customer.fields.find(
      (f) => f.id === "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );
    const emailField = customer.fields.find(
      (f) => f.id === "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
    );
    const nameField = customer.fields.find(
      (f) => f.id === "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
    );
    assert.equal(idField.primary, true);
    assert.equal(idField.notNull, true);
    assert.equal(idField.increment, false);
    assert.equal(idField.check, "");
    assert.equal(idField.type, "NUMBER");
    assert.equal(idField.size, "38,0");
    assert.equal(emailField.unique, true);
    assert.equal(nameField.comment, "display name");
    assert.equal(nameField.size, 200);

    assert.deepEqual(customer.namespace, {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    });
    assert.equal(customer.physical_model, undefined);
    assert.equal(customer.namespaces, undefined);

    const rel = diagram.relationships[0];
    assert.equal(rel.startTableId, "table:ANALYTICS.CORE.ORDER_HEADER");
    assert.equal(rel.endTableId, "table:ANALYTICS.CORE.CUSTOMER");
    assert.equal(
      rel.startFieldId,
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
    );
    assert.equal(
      rel.endFieldId,
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );
    assert.deepEqual(rel.fields, [
      {
        startFieldId: "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
        endFieldId: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      },
    ]);
    assert.equal(rel.cardinality, "many_to_one");
    assert.equal(rel.updateConstraint, "No action");
    assert.equal(rel.deleteConstraint, "No action");

    assert.deepEqual(diagram.transform, {
      pan: { x: 10, y: 20 },
      zoom: 1.25,
    });
  });

  it("loads missing diagram_layout as empty nodes and default viewport", () => {
    const project = twoTableProject();
    delete project.diagram_layout;
    const diagram = canonicalProjectToDiagram(project);
    assert.equal(typeof diagram.tables[0].x, "number");
    assert.equal(typeof diagram.tables[0].y, "number");
    assert.deepEqual(diagram.transform, {
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("rejects unknown project versions and forbidden credential fields", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          ...twoTableProject(),
          project_version: "2",
        }),
      /project_version|version/i,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          ...twoTableProject(),
          warehouse: "WH",
        }),
      /warehouse|unexpected|forbidden|unknown/i,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          ...twoTableProject({
            physical_model: {
              ...twoTableProject().physical_model,
              account: "xy12345",
            },
          }),
        }),
      /account|forbidden|unexpected|unknown/i,
    );
  });

  it("rejects unresolved relationship ids and accepts multiple namespaces", () => {
    const multi = twoSchemaProject();
    const diagram = canonicalProjectToDiagram(multi);
    assert.equal(diagram.tables.length, 3);
    assert.deepEqual(
      diagram.tables.find((t) => t.id === "table:ANALYTICS.CORE.CUSTOMER").namespace,
      { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
    );
    assert.deepEqual(
      diagram.tables.find((t) => t.id === "table:ANALYTICS.MART.CUSTOMER").namespace,
      { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
    );

    const badRel = twoTableProject();
    badRel.physical_model.relationships[0].target_table_id =
      "table:ANALYTICS.CORE.MISSING";
    assert.throws(
      () => canonicalProjectToDiagram(badRel),
      /unresolved|unknown|reference/i,
    );
  });
});

function numberType() {
  return {
    family: "NUMBER",
    text: "NUMBER(38, 0)",
    precision: 38,
    scale: 0,
    length: null,
  };
}

function twoSchemaProject() {
  const physical_model = {
    model_version: "1",
    name: "two-schema-model",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
      {
        id: "namespace:ANALYTICS.MART",
        catalog: "ANALYTICS",
        schema: "MART",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "CUSTOMER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 1,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER",
            name: "PK_CUSTOMER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.MART.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.MART",
        name: "CUSTOMER",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.MART.CUSTOMER.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 1,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.MART.CUSTOMER.PK_CUSTOMER",
            name: "PK_CUSTOMER",
            kind: "primary_key",
            columns: ["column:ANALYTICS.MART.CUSTOMER.CUSTOMER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.MART.ORDER_FACT",
        namespace_id: "namespace:ANALYTICS.MART",
        name: "ORDER_FACT",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.MART.ORDER_FACT.ORDER_ID",
            name: "ORDER_ID",
            ordinal: 1,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID",
            name: "CUSTOMER_ID",
            ordinal: 2,
            data_type: numberType(),
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
            name: "FK_ORDER_FACT_CUSTOMER",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
            referenced_columns: [
              "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
            ],
          },
          {
            id: "constraint:ANALYTICS.MART.ORDER_FACT.PK_ORDER_FACT",
            name: "PK_ORDER_FACT",
            kind: "primary_key",
            columns: ["column:ANALYTICS.MART.ORDER_FACT.ORDER_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
        name: "FK_ORDER_FACT_CUSTOMER",
        source_table_id: "table:ANALYTICS.MART.ORDER_FACT",
        source_column_ids: [
          "column:ANALYTICS.MART.ORDER_FACT.CUSTOMER_ID",
        ],
        target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
        target_column_ids: [
          "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
        ],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 40, y: 80 },
        "table:ANALYTICS.MART.CUSTOMER": { x: 40, y: 280 },
        "table:ANALYTICS.MART.ORDER_FACT": { x: 360, y: 120 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function legacyTwoTableDiagramWithoutNamespace() {
  return {
    title: "legacy-snowflake",
    tables: [
      {
        id: "cust-1",
        name: "customer",
        x: 40,
        y: 80,
        comment: "",
        fields: [
          {
            id: "cust-id",
            name: "customer_id",
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
        ],
      },
      {
        id: "ord-1",
        name: "order_header",
        x: 360,
        y: 120,
        comment: "",
        fields: [
          {
            id: "ord-id",
            name: "order_id",
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
            id: "ord-cust-id",
            name: "customer_id",
            type: "NUMBER",
            size: "38,0",
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
        id: "rel-1",
        name: "fk_order_header_customer",
        startTableId: "ord-1",
        endTableId: "cust-1",
        startFieldId: "ord-cust-id",
        endFieldId: "cust-id",
        fields: [{ startFieldId: "ord-cust-id", endFieldId: "cust-id" }],
        cardinality: "many_to_one",
        updateConstraint: "No action",
        deleteConstraint: "No action",
      },
    ],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

describe("diagramToCanonicalProject", () => {
  it("migrates legacy diagrams without namespace to MODEL.PUBLIC ids and DDL", () => {
    const diagram = legacyTwoTableDiagramWithoutNamespace();
    const exported = diagramToCanonicalProject(diagram);
    const model = exported.physical_model;

    assert.deepEqual(model.namespaces, [
      {
        id: "namespace:MODEL.PUBLIC",
        catalog: "MODEL",
        schema: "PUBLIC",
      },
    ]);
    assert.ok(model.tables.some((t) => t.id === "table:MODEL.PUBLIC.CUSTOMER"));
    assert.ok(
      model.tables.some((t) => t.id === "table:MODEL.PUBLIC.ORDER_HEADER"),
    );
    assert.equal(
      model.relationships[0].id,
      "relationship:MODEL.PUBLIC.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
    );
    assert.equal(
      model.relationships[0].source_table_id,
      "table:MODEL.PUBLIC.ORDER_HEADER",
    );
    assert.equal(
      model.relationships[0].target_table_id,
      "table:MODEL.PUBLIC.CUSTOMER",
    );

    const ddl = renderCanonicalSnowflakeDDL(exported);
    assert.match(ddl, /CREATE DATABASE IF NOT EXISTS MODEL;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS MODEL\.PUBLIC;/);
    assert.match(ddl, /CREATE TABLE MODEL\.PUBLIC\.CUSTOMER \(/);
    assert.match(ddl, /CREATE TABLE MODEL\.PUBLIC\.ORDER_HEADER \(/);
    assert.match(
      ddl,
      /ALTER TABLE MODEL\.PUBLIC\.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY \(CUSTOMER_ID\) REFERENCES MODEL\.PUBLIC\.CUSTOMER \(CUSTOMER_ID\) NOT ENFORCED;/,
    );
  });

  it("emits the FK constraint on the start table and references the end table when start field is non-key", () => {
    const diagram = {
      title: "fk-direction-test",
      tables: [
        {
          id: "tbl-customer",
          name: "CUSTOMER",
          x: 0,
          y: 0,
          fields: [
            {
              id: "fld-cust-id",
              name: "CUSTOMER_ID",
              type: "NUMBER",
              size: "38,0",
              primary: true,
              unique: false,
              notNull: true,
            },
          ],
        },
        {
          id: "tbl-orders",
          name: "ORDERS",
          x: 200,
          y: 0,
          fields: [
            {
              id: "fld-order-id",
              name: "ORDER_ID",
              type: "NUMBER",
              size: "38,0",
              primary: true,
              unique: false,
              notNull: true,
            },
            {
              id: "fld-order-cust-id",
              name: "CUSTOMER_ID",
              type: "NUMBER",
              size: "38,0",
              primary: false,
              unique: false,
              notNull: false,
            },
          ],
        },
      ],
      relationships: [
        {
          id: "rel-orders-customer",
          name: "fk_ORDERS_CUSTOMER_ID_CUSTOMER",
          startTableId: "tbl-orders",
          startFieldId: "fld-order-cust-id",
          endTableId: "tbl-customer",
          endFieldId: "fld-cust-id",
          fields: [
            {
              startFieldId: "fld-order-cust-id",
              endFieldId: "fld-cust-id",
            },
          ],
          cardinality: "many_to_one",
          updateConstraint: "No action",
          deleteConstraint: "No action",
        },
      ],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const exported = diagramToCanonicalProject(diagram);
    const model = exported.physical_model;

    const ordersTable = model.tables.find((t) => t.name === "ORDERS");
    const customerTable = model.tables.find((t) => t.name === "CUSTOMER");

    assert.ok(ordersTable, "ORDERS table should be present");
    assert.ok(customerTable, "CUSTOMER table should be present");

    const fkConstraint = ordersTable.constraints.find(
      (c) => c.kind === "foreign_key",
    );
    assert.ok(
      fkConstraint,
      "start table (ORDERS) must hold the foreign key constraint",
    );
    assert.equal(
      fkConstraint.referenced_table_id,
      customerTable.id,
      "foreign key must reference the end table (CUSTOMER)",
    );

    const orderCustCol = ordersTable.columns.find(
      (c) => c.name === "CUSTOMER_ID",
    );
    const custIdCol = customerTable.columns.find(
      (c) => c.name === "CUSTOMER_ID",
    );
    assert.deepEqual(fkConstraint.columns, [orderCustCol.id]);
    assert.deepEqual(fkConstraint.referenced_columns, [custIdCol.id]);

    const customerFkConstraint = customerTable.constraints.find(
      (c) => c.kind === "foreign_key",
    );
    assert.equal(
      customerFkConstraint,
      undefined,
      "end table (CUSTOMER) must not have an outbound foreign key constraint",
    );

    const modelRel = model.relationships.find(
      (r) => r.source_table_id === ordersTable.id,
    );
    assert.ok(modelRel, "relationship source should be start table");
    assert.equal(
      modelRel.target_table_id,
      customerTable.id,
      "relationship target should be end table",
    );

    const ddl = renderCanonicalSnowflakeDDL(exported);
    assert.match(
      ddl,
      /ALTER TABLE MODEL\.PUBLIC\.ORDERS ADD CONSTRAINT [^\s]+ FOREIGN KEY \(CUSTOMER_ID\) REFERENCES MODEL\.PUBLIC\.CUSTOMER \(CUSTOMER_ID\)/,
    );
  });

  it("rejects mixed namespace presence clearly", () => {
    const diagram = legacyTwoTableDiagramWithoutNamespace();
    diagram.tables[0].namespace = {
      id: "namespace:ANALYTICS.CORE",
      catalog: "ANALYTICS",
      schema: "CORE",
    };
    assert.throws(
      () => diagramToCanonicalProject(diagram),
      /mixed namespace presence/i,
    );
  });

  it("round-trips multi-schema projects with same table names and cross-schema FKs", () => {
    const original = twoSchemaProject();
    const diagram = canonicalProjectToDiagram(original);
    assert.equal(
      diagram.tables.filter((t) => t.name === "CUSTOMER").length,
      2,
    );
    assert.deepEqual(
      new Set(diagram.tables.map((t) => t.namespace.schema)),
      new Set(["CORE", "MART"]),
    );

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    assert.deepEqual(exported.physical_model.namespaces, [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
      {
        id: "namespace:ANALYTICS.MART",
        catalog: "ANALYTICS",
        schema: "MART",
      },
    ]);
    assert.ok(
      exported.physical_model.tables.some(
        (t) => t.id === "table:ANALYTICS.CORE.CUSTOMER",
      ),
    );
    assert.ok(
      exported.physical_model.tables.some(
        (t) => t.id === "table:ANALYTICS.MART.CUSTOMER",
      ),
    );
    const rel = exported.physical_model.relationships[0];
    assert.equal(
      rel.id,
      "relationship:ANALYTICS.MART.ORDER_FACT.FK_ORDER_FACT_CUSTOMER",
    );
    assert.equal(rel.source_table_id, "table:ANALYTICS.MART.ORDER_FACT");
    assert.equal(rel.target_table_id, "table:ANALYTICS.CORE.CUSTOMER");
    assert.deepEqual(rel.target_column_ids, [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ]);

    const again = diagramToCanonicalProject({
      title: diagram.title,
      tables: canonicalProjectToDiagram(exported).tables,
      relationships: canonicalProjectToDiagram(exported).relationships,
      transform: canonicalProjectToDiagram(exported).transform,
    });
    assert.deepEqual(again.physical_model, exported.physical_model);
  });

  it("rejects duplicate ids for namespaces, tables, columns, constraints, and relationships", () => {
    const dupNs = twoTableProject();
    dupNs.physical_model.namespaces = [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ];
    assert.throws(() => canonicalProjectToDiagram(dupNs), /unique ids|namespace/i);

    const dupTable = twoTableProject();
    dupTable.physical_model.tables[1] = structuredClone(
      dupTable.physical_model.tables[0],
    );
    assert.throws(() => canonicalProjectToDiagram(dupTable), /unique ids|sorted/i);

    const dupColumn = twoTableProject();
    dupColumn.physical_model.tables[0].columns[1] = structuredClone(
      dupColumn.physical_model.tables[0].columns[0],
    );
    dupColumn.physical_model.tables[0].columns[1].ordinal = 2;
    assert.throws(() => canonicalProjectToDiagram(dupColumn), /unique ids/i);

    const dupConstraint = twoTableProject();
    const customer = dupConstraint.physical_model.tables[0];
    customer.constraints.push(structuredClone(customer.constraints[0]));
    customer.constraints = [...customer.constraints].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    assert.throws(() => canonicalProjectToDiagram(dupConstraint), /unique ids/i);

    const dupRel = twoSchemaProject();
    dupRel.physical_model.relationships.push(
      structuredClone(dupRel.physical_model.relationships[0]),
    );
    assert.throws(() => canonicalProjectToDiagram(dupRel), /unique ids|sorted|inconsistent/i);
  });

  it("rejects empty or mismatched FK and relationship endpoints", () => {
    const emptyConstraintCols = twoTableProject();
    emptyConstraintCols.physical_model.tables[0].constraints[0].columns = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyConstraintCols),
      /non-empty|columns/i,
    );

    const emptyFkRefs = twoTableProject();
    const order = emptyFkRefs.physical_model.tables[1];
    const fk = order.constraints.find((c) => c.kind === "foreign_key");
    fk.referenced_columns = [];
    emptyFkRefs.physical_model.relationships[0].target_column_ids = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyFkRefs),
      /referenced_columns|non-empty|length/i,
    );

    const mismatchedFk = twoTableProject();
    const mismatchedOrder = mismatchedFk.physical_model.tables[1];
    const mismatched = mismatchedOrder.constraints.find(
      (c) => c.kind === "foreign_key",
    );
    mismatched.referenced_columns = [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
    ];
    mismatchedFk.physical_model.relationships[0].target_column_ids = [
      ...mismatched.referenced_columns,
    ];
    assert.throws(
      () => canonicalProjectToDiagram(mismatchedFk),
      /match|length/i,
    );

    const emptyRelSource = twoTableProject();
    emptyRelSource.physical_model.relationships[0].source_column_ids = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyRelSource),
      /source_column_ids|non-empty|inconsistent/i,
    );

    const emptyRelTarget = twoTableProject();
    emptyRelTarget.physical_model.relationships[0].target_column_ids = [];
    assert.throws(
      () => canonicalProjectToDiagram(emptyRelTarget),
      /target_column_ids|non-empty|length|inconsistent/i,
    );

    const mismatchedRel = twoTableProject();
    mismatchedRel.physical_model.relationships[0].target_column_ids.push(
      "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
    );
    assert.throws(
      () => canonicalProjectToDiagram(mismatchedRel),
      /length|match|inconsistent/i,
    );
  });

  it("rebuilds ids and references after rename edits", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    customer.name = "client";
    const nameField = customer.fields.find((f) => f.name === "CUSTOMER_NAME");
    nameField.name = "client_name";

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });

    assert.equal(exported.project_version, "1");
    const model = exported.physical_model;
    assert.equal(model.model_version, "2");
    assert.ok(model.tables.some((t) => t.id === "table:ANALYTICS.CORE.CLIENT"));
    assert.ok(
      model.tables.some((t) =>
        t.columns.some(
          (c) => c.id === "column:ANALYTICS.CORE.CLIENT.CLIENT_NAME",
        ),
      ),
    );
    const rel = model.relationships[0];
    assert.equal(rel.target_table_id, "table:ANALYTICS.CORE.CLIENT");
    assert.deepEqual(rel.target_column_ids, [
      "column:ANALYTICS.CORE.CLIENT.CUSTOMER_ID",
    ]);
  });

  it("keeps diagram_layout separate from physical_model", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });

    assert.ok(exported.diagram_layout);
    assert.ok(exported.diagram_layout.nodes);
    assert.ok(exported.diagram_layout.viewport);
    assert.equal(exported.physical_model.x, undefined);
    assert.equal(exported.physical_model.y, undefined);
    assert.equal(exported.physical_model.viewport, undefined);
    assert.equal(exported.physical_model.color, undefined);
    assert.equal(exported.physical_model.collapsed, undefined);
    assert.equal(exported.physical_model.history, undefined);
    assert.equal(exported.physical_model.nodes, undefined);

    for (const table of exported.physical_model.tables) {
      assert.equal(table.x, undefined);
      assert.equal(table.y, undefined);
      assert.equal(table.color, undefined);
      assert.equal(table.collapsed, undefined);
    }
  });

  it("JSON round-trips and preserves semantic values when names are unchanged", () => {
    const original = twoTableProject();
    const diagram = canonicalProjectToDiagram(original);
    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });

    const reloaded = JSON.parse(JSON.stringify(exported));
    const again = canonicalProjectToDiagram(reloaded);
    const second = diagramToCanonicalProject({
      title: again.title,
      tables: again.tables,
      relationships: again.relationships,
      transform: again.transform,
    });

    assert.deepEqual(second.physical_model, exported.physical_model);
    assert.equal(
      second.physical_model.tables[0].columns[0].name,
      "CUSTOMER_ID",
    );
    assert.equal(
      second.physical_model.relationships[0].name,
      "FK_ORDER_HEADER_CUSTOMER",
    );
  });

  it("fails on normalized name collisions", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    customer.fields[1].name = "customer-id";
    customer.fields[0].name = "CUSTOMER_ID";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /collision|duplicate|conflict/i,
    );
  });

  it("preserves non-conventional PK and single-unique names across byte-semantic round trip", () => {
    const project = twoTableProject();
    const customer = project.physical_model.tables.find(
      (t) => t.name === "CUSTOMER",
    );
    customer.constraints = [
      {
        id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER_LEGACY",
        name: "PK_CUSTOMER_LEGACY",
        kind: "primary_key",
        columns: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
        referenced_table_id: null,
        referenced_columns: [],
      },
      {
        id: "constraint:ANALYTICS.CORE.CUSTOMER.EMAIL_NATURAL_KEY",
        name: "EMAIL_NATURAL_KEY",
        kind: "unique",
        columns: ["column:ANALYTICS.CORE.CUSTOMER.EMAIL"],
        referenced_table_id: null,
        referenced_columns: [],
      },
    ].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

    const diagram = canonicalProjectToDiagram(project);
    assert.equal(
      diagram.tables.find((t) => t.name === "CUSTOMER").constraintView
        ?.primaryKeyName,
      "PK_CUSTOMER_LEGACY",
    );
    assert.equal(
      diagram.tables.find((t) => t.name === "CUSTOMER").constraintView
        ?.uniqueNames?.[
        "column:ANALYTICS.CORE.CUSTOMER.EMAIL"
      ],
      "EMAIL_NATURAL_KEY",
    );
    assert.equal(diagram.tables[0].physical_model, undefined);

    const customerTable = diagram.tables.find((t) => t.name === "CUSTOMER");
    customerTable.name = "client";
    const emailField = customerTable.fields.find((f) => f.name === "EMAIL");
    emailField.name = "email_addr";

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const exportedCustomer = exported.physical_model.tables.find(
      (t) => t.name === "CLIENT",
    );
    const pk = exportedCustomer.constraints.find(
      (c) => c.kind === "primary_key",
    );
    const uq = exportedCustomer.constraints.find((c) => c.kind === "unique");
    assert.equal(pk.name, "PK_CUSTOMER_LEGACY");
    assert.equal(
      pk.id,
      "constraint:ANALYTICS.CORE.CLIENT.PK_CUSTOMER_LEGACY",
    );
    assert.equal(uq.name, "EMAIL_NATURAL_KEY");
    assert.equal(
      uq.id,
      "constraint:ANALYTICS.CORE.CLIENT.EMAIL_NATURAL_KEY",
    );
    assert.deepEqual(uq.columns, [
      "column:ANALYTICS.CORE.CLIENT.EMAIL_ADDR",
    ]);

    const again = diagramToCanonicalProject({
      title: diagram.title,
      tables: canonicalProjectToDiagram(exported).tables,
      relationships: canonicalProjectToDiagram(exported).relationships,
      transform: canonicalProjectToDiagram(exported).transform,
    });
    assert.deepEqual(again.physical_model, exported.physical_model);
  });

  it("assigns stable projection-local ids for composite unique constraints", () => {
    const project = twoTableProject();
    const customer = project.physical_model.tables.find(
      (t) => t.name === "CUSTOMER",
    );
    customer.constraints.push({
      id: "constraint:ANALYTICS.CORE.CUSTOMER.UQ_NAME_EMAIL",
      name: "UQ_NAME_EMAIL",
      kind: "unique",
      columns: [
        "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_NAME",
        "column:ANALYTICS.CORE.CUSTOMER.EMAIL",
      ],
      referenced_table_id: null,
      referenced_columns: [],
    });
    customer.constraints = [...customer.constraints].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );

    const diagram = canonicalProjectToDiagram(project);
    const imported = diagram.tables.find((t) => t.name === "CUSTOMER");
    assert.equal(imported.uniqueConstraints.length, 1);
    assert.equal(imported.uniqueConstraints[0].name, "UQ_NAME_EMAIL");
    assert.deepEqual(imported.uniqueConstraints[0].fields, [
      "CUSTOMER_NAME",
      "EMAIL",
    ]);
    assert.equal(imported.uniqueConstraints[0].id, 0);

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const exportedCustomer = exported.physical_model.tables.find(
      (t) => t.name === "CUSTOMER",
    );
    const composite = exportedCustomer.constraints.find(
      (c) => c.name === "UQ_NAME_EMAIL",
    );
    assert.ok(composite);
    assert.equal(composite.kind, "unique");
    assert.equal(composite.columns.length, 2);
  });

  it("maps relationship fields by table+field pair and rejects duplicates clearly", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    const order = diagram.tables.find((t) => t.name === "ORDER_HEADER");
    const sharedFieldId = "shared-field-id";
    const customerPk = customer.fields[0];
    const orderFk = order.fields[1];
    customerPk.id = sharedFieldId;
    orderFk.id = sharedFieldId;
    diagram.relationships[0].startFieldId = sharedFieldId;
    diagram.relationships[0].endFieldId = sharedFieldId;
    diagram.relationships[0].fields = [
      { startFieldId: sharedFieldId, endFieldId: sharedFieldId },
    ];

    const exported = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const rel = exported.physical_model.relationships[0];
    assert.equal(
      rel.source_column_ids[0],
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
    );
    assert.equal(
      rel.target_column_ids[0],
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );

    const dupTables = structuredClone(diagram);
    dupTables.tables[1].id = dupTables.tables[0].id;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: dupTables.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /duplicate table id/i,
    );

    const dupFields = structuredClone(diagram);
    dupFields.tables[0].fields[1].id = dupFields.tables[0].fields[0].id;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: dupFields.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /duplicate field id/i,
    );

    const badRel = structuredClone(diagram);
    badRel.relationships[0].startFieldId = "missing-field";
    badRel.relationships[0].fields = [
      { startFieldId: "missing-field", endFieldId: sharedFieldId },
    ];
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: badRel.tables,
          relationships: badRel.relationships,
          transform: diagram.transform,
        }),
      /unresolved|unknown/i,
    );
  });

  it("rejects invalid type bounds and non-positive zoom", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    const customer = diagram.tables.find((t) => t.name === "CUSTOMER");
    const idField = customer.fields.find((f) => f.name === "CUSTOMER_ID");
    idField.size = "39,0";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /precision|NUMBER/i,
    );

    idField.size = "10,10";
    const allowedEqualScale = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    const allowedNumber = allowedEqualScale.physical_model.tables
      .find((t) => t.name === "CUSTOMER")
      .columns.find((c) => c.name === "CUSTOMER_ID").data_type;
    assert.equal(allowedNumber.precision, 10);
    assert.equal(allowedNumber.scale, 10);
    assert.equal(allowedNumber.text, "NUMBER(10, 10)");

    idField.size = "38,37";
    const allowedMaxScale = diagramToCanonicalProject({
      title: diagram.title,
      tables: diagram.tables,
      relationships: diagram.relationships,
      transform: diagram.transform,
    });
    assert.equal(
      allowedMaxScale.physical_model.tables
        .find((t) => t.name === "CUSTOMER")
        .columns.find((c) => c.name === "CUSTOMER_ID").data_type.scale,
      37,
    );

    idField.size = "38,38";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /scale|NUMBER/i,
    );

    idField.size = "10,11";
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /scale|NUMBER/i,
    );

    idField.size = "38,0";
    const nameField = customer.fields.find((f) => f.name === "CUSTOMER_NAME");
    nameField.size = 0;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: diagram.transform,
        }),
      /length|VARCHAR/i,
    );

    nameField.size = 200;
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: { ...diagram.transform, zoom: 0 },
        }),
      /zoom/i,
    );
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: diagram.title,
          tables: diagram.tables,
          relationships: diagram.relationships,
          transform: { ...diagram.transform, zoom: Number.NaN },
        }),
      /zoom/i,
    );
  });

  it("exports newly selected Snowflake types using datatype defaultSize", () => {
    // Mirrors snowflakeTypes.NUMBER.defaultSize / TIMESTAMP_NTZ.defaultSize
    // (assigned by TableField when a type is selected).
    const numberDefaultSize = "38,0";
    const timestampNtzDefaultSize = 9;

    const diagram = {
      title: "defaults-model",
      tables: [
        {
          id: "t1",
          name: "SAMPLE",
          x: 0,
          y: 0,
          comment: "",
          fields: [
            {
              id: "f1",
              name: "AMOUNT",
              type: "NUMBER",
              size: numberDefaultSize,
              default: "",
              check: "",
              primary: true,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
            {
              id: "f2",
              name: "occurred_at",
              type: "TIMESTAMP_NTZ",
              size: timestampNtzDefaultSize,
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

    const exported = diagramToCanonicalProject(diagram);
    const columns = exported.physical_model.tables[0].columns;
    assert.deepEqual(columns[0].data_type, {
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    });
    assert.deepEqual(columns[1].data_type, {
      family: "TIMESTAMP_NTZ",
      text: "TIMESTAMP_NTZ(9)",
      precision: 9,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    });
  });

  it("supports extended Snowflake data types and unconstrained VARCHAR", () => {
    const testFields = [
      { name: "COL_VARCHAR_UNCONSTRAINED", type: "VARCHAR", size: "" },
      { name: "COL_VARCHAR_SIZED", type: "VARCHAR", size: 100 },
      { name: "COL_TIME", type: "TIME", size: 9 },
      { name: "COL_TIMESTAMP_LTZ", type: "TIMESTAMP_LTZ", size: 9 },
      { name: "COL_TIMESTAMP_TZ", type: "TIMESTAMP_TZ", size: 9 },
      { name: "COL_VARIANT", type: "VARIANT" },
      { name: "COL_OBJECT", type: "OBJECT" },
      { name: "COL_ARRAY", type: "ARRAY" },
      { name: "COL_GEOGRAPHY", type: "GEOGRAPHY" },
      { name: "COL_GEOMETRY", type: "GEOMETRY" },
    ];

    const diagram = {
      title: "all-types-model",
      tables: [
        {
          id: "t1",
          name: "EXTENDED_TYPES",
          x: 0,
          y: 0,
          comment: "",
          fields: testFields.map((f, i) => ({
            id: `f_${i}`,
            name: f.name,
            type: f.type,
            size: f.size ?? "",
            default: "",
            check: "",
            primary: i === 0,
            unique: false,
            notNull: i === 0,
            increment: false,
            comment: "",
          })),
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const exported = diagramToCanonicalProject(diagram);
    const ddl = renderCanonicalSnowflakeDDL(exported);
    assert.match(
      ddl,
      /COL_VARCHAR_UNCONSTRAINED VARCHAR\(16777216\) NOT NULL/,
    );
    assert.match(ddl, /COL_VARCHAR_SIZED VARCHAR\(100\)/);
    assert.match(ddl, /COL_TIME TIME\(9\)/);
    assert.match(ddl, /COL_TIMESTAMP_LTZ TIMESTAMP_LTZ\(9\)/);
    assert.match(ddl, /COL_TIMESTAMP_TZ TIMESTAMP_TZ\(9\)/);
    assert.match(ddl, /COL_VARIANT VARIANT/);
    assert.match(ddl, /COL_OBJECT OBJECT/);
    assert.match(ddl, /COL_ARRAY ARRAY/);
    assert.match(ddl, /COL_GEOGRAPHY GEOGRAPHY/);
    assert.match(ddl, /COL_GEOMETRY GEOMETRY/);

    const reimported = parseSnowflakeDDLToCanonicalProject(ddl);
    assert.equal(reimported.physical_model.tables[0].columns.length, 10);
  });

  it("allows the same FK name on different source tables and rejects duplicates on one", () => {
    const sharedFk = "FK_SHARED_PARENT";
    const diagram = {
      title: "shared-fk-name",
      tables: [
        {
          id: "parent",
          name: "PARENT",
          x: 0,
          y: 0,
          comment: "",
          fields: [
            {
              id: "p-id",
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
          ],
        },
        {
          id: "child-a",
          name: "CHILD_A",
          x: 200,
          y: 0,
          comment: "",
          fields: [
            {
              id: "a-id",
              name: "CHILD_A_ID",
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
              id: "a-fk",
              name: "PARENT_ID",
              type: "NUMBER",
              size: "38,0",
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
        {
          id: "child-b",
          name: "CHILD_B",
          x: 200,
          y: 200,
          comment: "",
          fields: [
            {
              id: "b-id",
              name: "CHILD_B_ID",
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
              id: "b-fk",
              name: "PARENT_ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: false,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
            },
            {
              id: "b-fk-2",
              name: "OTHER_PARENT_ID",
              type: "NUMBER",
              size: "38,0",
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
          id: "r1",
          name: sharedFk,
          startTableId: "child-a",
          startFieldId: "a-fk",
          endTableId: "parent",
          endFieldId: "p-id",
          cardinality: "n:1",
        },
        {
          id: "r2",
          name: sharedFk,
          startTableId: "child-b",
          startFieldId: "b-fk",
          endTableId: "parent",
          endFieldId: "p-id",
          cardinality: "n:1",
        },
      ],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const exported = diagramToCanonicalProject(diagram);
    const fkNames = exported.physical_model.relationships.map((r) => r.name);
    assert.deepEqual(fkNames.sort(), [sharedFk, sharedFk]);

    const duplicateOnSameTable = structuredClone(diagram);
    duplicateOnSameTable.relationships.push({
      id: "r3",
      name: sharedFk,
      startTableId: "child-b",
      startFieldId: "b-fk-2",
      endTableId: "parent",
      endFieldId: "p-id",
      cardinality: "n:1",
    });
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: duplicateOnSameTable.title,
          tables: duplicateOnSameTable.tables,
          relationships: duplicateOnSameTable.relationships,
          transform: duplicateOnSameTable.transform,
        }),
      /constraint collision/i,
    );
  });

  it("rejects invalid imported canonical type bounds", () => {
    const badNumber = twoTableProject();
    badNumber.physical_model.tables[0].columns[0].data_type = {
      family: "NUMBER",
      text: "NUMBER(39, 0)",
      precision: 39,
      scale: 0,
      length: null,
    };
    assert.throws(() => canonicalProjectToDiagram(badNumber), /precision|NUMBER/i);

    const badVarchar = twoTableProject();
    badVarchar.physical_model.tables[0].columns[1].data_type = {
      family: "VARCHAR",
      text: "VARCHAR(0)",
      precision: null,
      scale: null,
      length: 0,
    };
    assert.throws(() => canonicalProjectToDiagram(badVarchar), /length|VARCHAR/i);

    const badTs = twoTableProject();
    const order = badTs.physical_model.tables[1];
    order.columns[2].data_type = {
      family: "TIMESTAMP_NTZ",
      text: "TIMESTAMP_NTZ(10)",
      precision: 10,
      scale: null,
      length: null,
    };
    assert.throws(
      () => canonicalProjectToDiagram(badTs),
      /precision|TIMESTAMP_NTZ/i,
    );

    const badParamless = twoTableProject();
    badParamless.physical_model.tables[1].columns[2].data_type = {
      family: "DATE",
      text: "DATE",
      precision: 1,
      scale: null,
      length: null,
    };
    assert.throws(() => canonicalProjectToDiagram(badParamless), /DATE|null/i);
  });
});

function createTableBodies(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.toUpperCase().startsWith("CREATE TABLE"));
}

function cyclicFkProject() {
  const physical_model = {
    model_version: "1",
    name: "cycle-fk",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.ALPHA",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "ALPHA",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.ALPHA.ALPHA_ID",
            name: "ALPHA_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.ALPHA.BETA_ID",
            name: "BETA_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.ALPHA.FK_ALPHA_BETA",
            name: "FK_ALPHA_BETA",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.ALPHA.BETA_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.BETA",
            referenced_columns: ["column:ANALYTICS.CORE.BETA.BETA_ID"],
          },
          {
            id: "constraint:ANALYTICS.CORE.ALPHA.PK_ALPHA",
            name: "PK_ALPHA",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.ALPHA.ALPHA_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
      {
        id: "table:ANALYTICS.CORE.BETA",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "BETA",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.BETA.BETA_ID",
            name: "BETA_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.BETA.ALPHA_ID",
            name: "ALPHA_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.BETA.FK_BETA_ALPHA",
            name: "FK_BETA_ALPHA",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.BETA.ALPHA_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.ALPHA",
            referenced_columns: ["column:ANALYTICS.CORE.ALPHA.ALPHA_ID"],
          },
          {
            id: "constraint:ANALYTICS.CORE.BETA.PK_BETA",
            name: "PK_BETA",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.BETA.BETA_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.CORE.ALPHA.FK_ALPHA_BETA",
        name: "FK_ALPHA_BETA",
        source_table_id: "table:ANALYTICS.CORE.ALPHA",
        source_column_ids: ["column:ANALYTICS.CORE.ALPHA.BETA_ID"],
        target_table_id: "table:ANALYTICS.CORE.BETA",
        target_column_ids: ["column:ANALYTICS.CORE.BETA.BETA_ID"],
        cardinality: "many_to_one",
      },
      {
        id: "relationship:ANALYTICS.CORE.BETA.FK_BETA_ALPHA",
        name: "FK_BETA_ALPHA",
        source_table_id: "table:ANALYTICS.CORE.BETA",
        source_column_ids: ["column:ANALYTICS.CORE.BETA.ALPHA_ID"],
        target_table_id: "table:ANALYTICS.CORE.ALPHA",
        target_column_ids: ["column:ANALYTICS.CORE.ALPHA.ALPHA_ID"],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.ALPHA": { x: 40, y: 80 },
        "table:ANALYTICS.CORE.BETA": { x: 360, y: 120 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function selfFkProject() {
  const physical_model = {
    model_version: "1",
    name: "self-fk",
    namespaces: [
      {
        id: "namespace:ANALYTICS.CORE",
        catalog: "ANALYTICS",
        schema: "CORE",
      },
    ],
    tables: [
      {
        id: "table:ANALYTICS.CORE.EMPLOYEE",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "EMPLOYEE",
        kind: "table",
        columns: [
          {
            id: "column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID",
            name: "EMPLOYEE_ID",
            ordinal: 1,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: "column:ANALYTICS.CORE.EMPLOYEE.MANAGER_ID",
            name: "MANAGER_ID",
            ordinal: 2,
            data_type: {
              family: "NUMBER",
              text: "NUMBER(38, 0)",
              precision: 38,
              scale: 0,
              length: null,
            },
            nullable: true,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: "constraint:ANALYTICS.CORE.EMPLOYEE.FK_EMPLOYEE_MANAGER",
            name: "FK_EMPLOYEE_MANAGER",
            kind: "foreign_key",
            columns: ["column:ANALYTICS.CORE.EMPLOYEE.MANAGER_ID"],
            referenced_table_id: "table:ANALYTICS.CORE.EMPLOYEE",
            referenced_columns: [
              "column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID",
            ],
          },
          {
            id: "constraint:ANALYTICS.CORE.EMPLOYEE.PK_EMPLOYEE",
            name: "PK_EMPLOYEE",
            kind: "primary_key",
            columns: ["column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID"],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
        comment: null,
      },
    ],
    relationships: [
      {
        id: "relationship:ANALYTICS.CORE.EMPLOYEE.FK_EMPLOYEE_MANAGER",
        name: "FK_EMPLOYEE_MANAGER",
        source_table_id: "table:ANALYTICS.CORE.EMPLOYEE",
        source_column_ids: ["column:ANALYTICS.CORE.EMPLOYEE.MANAGER_ID"],
        target_table_id: "table:ANALYTICS.CORE.EMPLOYEE",
        target_column_ids: ["column:ANALYTICS.CORE.EMPLOYEE.EMPLOYEE_ID"],
        cardinality: "many_to_one",
      },
    ],
  };

  return {
    project_version: "1",
    physical_model,
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.EMPLOYEE": { x: 40, y: 80 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

describe("renderCanonicalSnowflakeDDL", () => {
  it("emits informational NOT ENFORCED DDL without RELY", () => {
    const ddl = renderCanonicalSnowflakeDDL(twoTableProject());
    assert.match(ddl, /CREATE DATABASE IF NOT EXISTS ANALYTICS;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.CUSTOMER \(/);
    assert.match(ddl, /PRIMARY KEY \(CUSTOMER_ID\) NOT ENFORCED/);
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.ORDER_HEADER ADD CONSTRAINT FK_ORDER_HEADER_CUSTOMER FOREIGN KEY \(CUSTOMER_ID\) REFERENCES ANALYTICS\.CORE\.CUSTOMER \(CUSTOMER_ID\) NOT ENFORCED;/,
    );
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.equal(ddl.includes("RELY"), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(twoTableProject()));
    assert.ok(ddl.endsWith("\n"));
  });

  it("accepts a physical model directly", () => {
    const ddl = renderCanonicalSnowflakeDDL(twoTableProject().physical_model);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.ORDER_HEADER/);
  });

  it("emits cyclic foreign keys as deferred ALTER TABLE statements", () => {
    const project = cyclicFkProject();
    const ddl = renderCanonicalSnowflakeDDL(project);
    const createTables = [...ddl.matchAll(/CREATE TABLE /g)];
    assert.equal(createTables.length, 2);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.ALPHA \(/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.BETA \(/);
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.equal([...ddl.matchAll(/ALTER TABLE /g)].length, 2);
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.ALPHA ADD CONSTRAINT FK_ALPHA_BETA FOREIGN KEY \(BETA_ID\) REFERENCES ANALYTICS\.CORE\.BETA \(BETA_ID\) NOT ENFORCED;/,
    );
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.BETA ADD CONSTRAINT FK_BETA_ALPHA FOREIGN KEY \(ALPHA_ID\) REFERENCES ANALYTICS\.CORE\.ALPHA \(ALPHA_ID\) NOT ENFORCED;/,
    );
    assert.match(ddl, /NOT ENFORCED/);
    assert.equal(ddl.includes("RELY"), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("emits self-referential foreign keys as deferred ALTER TABLE statements", () => {
    const project = selfFkProject();
    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.equal([...ddl.matchAll(/CREATE TABLE /g)].length, 1);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.EMPLOYEE \(/);
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.equal([...ddl.matchAll(/ALTER TABLE /g)].length, 1);
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.CORE\.EMPLOYEE ADD CONSTRAINT FK_EMPLOYEE_MANAGER FOREIGN KEY \(MANAGER_ID\) REFERENCES ANALYTICS\.CORE\.EMPLOYEE \(EMPLOYEE_ID\) NOT ENFORCED;/,
    );
    assert.match(ddl, /NOT ENFORCED/);
    assert.equal(ddl.includes("RELY"), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("emits multi-schema DDL with qualified cross-schema foreign keys", () => {
    const project = twoSchemaProject();
    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(ddl, /CREATE DATABASE IF NOT EXISTS ANALYTICS;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;/);
    assert.match(ddl, /CREATE SCHEMA IF NOT EXISTS ANALYTICS\.MART;/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.CORE\.CUSTOMER \(/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.MART\.CUSTOMER \(/);
    assert.match(ddl, /CREATE TABLE ANALYTICS\.MART\.ORDER_FACT \(/);
    assert.equal(
      createTableBodies(ddl).some((body) => /FOREIGN KEY/i.test(body)),
      false,
    );
    assert.match(
      ddl,
      /ALTER TABLE ANALYTICS\.MART\.ORDER_FACT ADD CONSTRAINT FK_ORDER_FACT_CUSTOMER FOREIGN KEY \(CUSTOMER_ID\) REFERENCES ANALYTICS\.CORE\.CUSTOMER \(CUSTOMER_ID\) NOT ENFORCED;/,
    );
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("preserves column and table comments with apostrophe doubling", () => {
    const tableComment = "table note: DEFAULT, NOT NULL; commas, and it's quoted";
    const columnComment = "col note: a,b;c'd and NOT NULL / DEFAULT";
    const project = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "comment-round-trip",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.SAMPLE",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "SAMPLE",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.SAMPLE.ID",
                name: "ID",
                ordinal: 1,
                data_type: numberType(),
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.SAMPLE.NOTE",
                name: "NOTE",
                ordinal: 2,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(100)",
                  precision: null,
                  scale: null,
                  length: 100,
                },
                nullable: true,
                default: null,
                comment: columnComment,
              },
              {
                id: "column:ANALYTICS.CORE.SAMPLE.LABEL",
                name: "LABEL",
                ordinal: 3,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(100)",
                  precision: null,
                  scale: null,
                  length: 100,
                },
                nullable: false,
                default: "'DEFAULT'",
                comment: "says DEFAULT and NOT NULL, with; punctuation",
              },
            ],
            constraints: [
              {
                id: "constraint:ANALYTICS.CORE.SAMPLE.PK_SAMPLE",
                name: "PK_SAMPLE",
                kind: "primary_key",
                columns: ["column:ANALYTICS.CORE.SAMPLE.ID"],
                referenced_table_id: null,
                referenced_columns: [],
              },
            ],
            comment: tableComment,
          },
        ],
        relationships: [],
      },
    };

    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(
      ddl,
      /COMMENT='table note: DEFAULT, NOT NULL; commas, and it''s quoted'/,
    );
    assert.match(
      ddl,
      /COMMENT 'col note: a,b;c''d and NOT NULL \/ DEFAULT'/,
    );
    assert.match(
      ddl,
      /COMMENT 'says DEFAULT and NOT NULL, with; punctuation'/,
    );
    assert.match(ddl, /DEFAULT 'DEFAULT'/);
    assert.match(ddl, /NOTE VARCHAR\(100\) COMMENT /);
    assert.match(ddl, /LABEL VARCHAR\(100\) NOT NULL DEFAULT 'DEFAULT' COMMENT /);
    assert.equal(ddl.includes('COMMENT="'), false);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("preserves embedded double quotes in COMMENT literals", () => {
    const project = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "embedded-dq",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.SAMPLE",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "SAMPLE",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.SAMPLE.ID",
                name: "ID",
                ordinal: 1,
                data_type: numberType(),
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.SAMPLE.NOTE",
                name: "NOTE",
                ordinal: 2,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(50)",
                  precision: null,
                  scale: null,
                  length: 50,
                },
                nullable: true,
                default: null,
                comment: 'a "b"',
              },
            ],
            constraints: [
              {
                id: "constraint:ANALYTICS.CORE.SAMPLE.PK_SAMPLE",
                name: "PK_SAMPLE",
                kind: "primary_key",
                columns: ["column:ANALYTICS.CORE.SAMPLE.ID"],
                referenced_table_id: null,
                referenced_columns: [],
              },
            ],
            comment: 'table "note"',
          },
        ],
        relationships: [],
      },
    };

    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(ddl, /COMMENT 'a "b"'/);
    assert.match(ddl, /COMMENT='table "note"'/);
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("renders deterministic empty DDL for empty physical models", () => {
    const ddl = renderCanonicalSnowflakeDDL({
      model_version: "1",
      name: "empty",
      namespaces: [],
      tables: [],
      relationships: [],
    });
    assert.equal(ddl, "\n");
    assert.equal(
      ddl,
      renderCanonicalSnowflakeDDL({
        project_version: "1",
        physical_model: {
          model_version: "1",
          name: "empty",
          namespaces: [],
          tables: [],
          relationships: [],
        },
      }),
    );
  });
});

describe("renderCanonicalSnowflakeStatements", () => {
  it("emits discrete executable statements without empty entries", () => {
    const stmts = renderCanonicalSnowflakeStatements(twoTableProject());
    assert.ok(stmts.length >= 3);
    for (const stmt of stmts) {
      assert.ok(typeof stmt === "string" && stmt.trim().length > 0);
      assert.equal(stmt.endsWith(";"), true);
    }
    assert.match(stmts[0], /^CREATE DATABASE IF NOT EXISTS ANALYTICS;$/);
    assert.match(stmts[1], /^CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;$/);
    assert.match(stmts[2], /^CREATE TABLE IF NOT EXISTS ANALYTICS\.CORE\.CUSTOMER/);
  });

  it("applies target database and schema overrides across all emitted statements", () => {
    const stmts = renderCanonicalSnowflakeStatements(twoTableProject(), {
      databaseOverride: "PROD_DB",
      schemaOverride: "SALES",
    });
    assert.match(stmts[0], /^CREATE DATABASE IF NOT EXISTS PROD_DB;$/);
    assert.match(stmts[1], /^CREATE SCHEMA IF NOT EXISTS PROD_DB\.SALES;$/);
    assert.match(stmts[2], /^CREATE TABLE IF NOT EXISTS PROD_DB\.SALES\.CUSTOMER/);
  });

  it("supports replace: true replacing IF NOT EXISTS semantics", () => {
    const stmts = renderCanonicalSnowflakeStatements(twoTableProject(), {
      replace: true,
    });
    assert.match(stmts[0], /^CREATE DATABASE IF NOT EXISTS ANALYTICS;$/);
    assert.match(stmts[1], /^CREATE SCHEMA IF NOT EXISTS ANALYTICS\.CORE;$/);
    assert.match(stmts[2], /^CREATE OR REPLACE TABLE ANALYTICS\.CORE\.CUSTOMER/);
  });
});

describe("validatePhysicalModel identifiers", () => {
  it("rejects lowercase, hyphen, leading digit, and whitespace identifiers", () => {
    const lowerCatalog = twoTableProject();
    lowerCatalog.physical_model.namespaces[0] = {
      id: "namespace:analytics.CORE",
      catalog: "analytics",
      schema: "CORE",
    };
    assert.throws(
      () => canonicalProjectToDiagram(lowerCatalog),
      /identifier|catalog/i,
    );

    const hyphenSchema = twoTableProject();
    hyphenSchema.physical_model.namespaces[0] = {
      id: "namespace:ANALYTICS.CORE-1",
      catalog: "ANALYTICS",
      schema: "CORE-1",
    };
    assert.throws(
      () => canonicalProjectToDiagram(hyphenSchema),
      /identifier|schema/i,
    );

    const leadingDigit = twoTableProject();
    leadingDigit.physical_model.tables[0].name = "1BAD";
    leadingDigit.physical_model.tables[0].id = "table:ANALYTICS.CORE.1BAD";
    assert.throws(
      () => canonicalProjectToDiagram(leadingDigit),
      /identifier|name/i,
    );

    const whitespaceColumn = twoTableProject();
    whitespaceColumn.physical_model.tables[0].columns[0].name = " BAD";
    whitespaceColumn.physical_model.tables[0].columns[0].id =
      "column:ANALYTICS.CORE.CUSTOMER. BAD";
    assert.throws(
      () => canonicalProjectToDiagram(whitespaceColumn),
      /identifier|name/i,
    );

    const lowerConstraint = twoTableProject();
    lowerConstraint.physical_model.tables[0].constraints[0].name = "pk_customer";
    lowerConstraint.physical_model.tables[0].constraints[0].id =
      "constraint:ANALYTICS.CORE.CUSTOMER.pk_customer";
    assert.throws(
      () => canonicalProjectToDiagram(lowerConstraint),
      /identifier|name/i,
    );

    const trimmedLookalike = twoTableProject();
    trimmedLookalike.physical_model.tables[0].name = "CUSTOMER ";
    trimmedLookalike.physical_model.tables[0].id = "table:ANALYTICS.CORE.CUSTOMER ";
    assert.throws(
      () => canonicalProjectToDiagram(trimmedLookalike),
      /identifier|name/i,
    );
  });

  it("keeps exact path ids for legal uppercase identifiers", () => {
    const diagram = canonicalProjectToDiagram(twoTableProject());
    assert.equal(diagram.tables[0].id, "table:ANALYTICS.CORE.CUSTOMER");
    assert.equal(
      diagram.tables[0].fields[0].id,
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    );
  });
});

describe("empty canonical projects", () => {
  it("loads zero namespaces/tables/relationships to an empty diagram", () => {
    const diagram = canonicalProjectToDiagram({
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "empty-model",
        namespaces: [],
        tables: [],
        relationships: [],
      },
    });
    assert.equal(diagram.title, "empty-model");
    assert.deepEqual(diagram.tables, []);
    assert.deepEqual(diagram.relationships, []);
    assert.deepEqual(diagram.transform, {
      pan: { x: 0, y: 0 },
      zoom: 1,
    });
  });

  it("saves empty tables and relationships as empty physical model collections", () => {
    const exported = diagramToCanonicalProject({
      title: "empty-model",
      tables: [],
      relationships: [],
      transform: { pan: { x: 3, y: 4 }, zoom: 1.5 },
    });
    assert.deepEqual(exported.physical_model.namespaces, []);
    assert.deepEqual(exported.physical_model.tables, []);
    assert.deepEqual(exported.physical_model.relationships, []);
    assert.deepEqual(exported.diagram_layout, {
      nodes: {},
      viewport: { x: 3, y: 4, zoom: 1.5 },
    });
  });

  it("rejects relationships when tables are empty and nonempty tables without namespaces", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: "empty-model",
          tables: [],
          relationships: [
            {
              id: "r1",
              name: "FK_X",
              startTableId: "t1",
              endTableId: "t2",
              startFieldId: "f1",
              endFieldId: "f2",
            },
          ],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /relationship|empty|table/i,
    );

    const nonemptyTablesEmptyNamespaces = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "bad",
        namespaces: [],
        tables: [
          {
            id: "table:ANALYTICS.CORE.CUSTOMER",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "CUSTOMER",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
                name: "CUSTOMER_ID",
                ordinal: 1,
                data_type: numberType(),
                nullable: false,
                default: null,
                comment: null,
              },
            ],
            constraints: [],
            comment: null,
          },
        ],
        relationships: [],
      },
    };
    assert.throws(
      () => canonicalProjectToDiagram(nonemptyTablesEmptyNamespaces),
      /namespace/i,
    );
  });

  it("preserves legacy nonempty all-missing namespace as MODEL.PUBLIC", () => {
    const exported = diagramToCanonicalProject({
      title: "legacy",
      tables: [
        {
          id: 1,
          name: "customer",
          x: 0,
          y: 0,
          comment: "",
          fields: [
            {
              id: "f1",
              name: "id",
              type: "NUMBER",
              size: "38,0",
              default: "",
              primary: true,
              unique: false,
              notNull: true,
              comment: "",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    });
    assert.deepEqual(exported.physical_model.namespaces, [
      { id: "namespace:MODEL.PUBLIC", catalog: "MODEL", schema: "PUBLIC" },
    ]);
    assert.equal(exported.physical_model.tables[0].id, "table:MODEL.PUBLIC.CUSTOMER");
  });
});

describe("constraint uniqueness and required namespaces", () => {
  it("rejects PRIMARY KEY with duplicate column ids", () => {
    const project = twoTableProject();
    const pk = project.physical_model.tables[0].constraints.find(
      (c) => c.kind === "primary_key",
    );
    pk.columns = [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ];
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /columns must have unique ids/i,
    );
  });

  it("rejects two primary_key constraints on one table", () => {
    const project = twoTableProject();
    const table = project.physical_model.tables[0];
    table.constraints.push({
      id: "constraint:ANALYTICS.CORE.CUSTOMER.PK_CUSTOMER_ALT",
      name: "PK_CUSTOMER_ALT",
      kind: "primary_key",
      columns: ["column:ANALYTICS.CORE.CUSTOMER.EMAIL"],
      referenced_table_id: null,
      referenced_columns: [],
    });
    table.constraints = [...table.constraints].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /at most one primary_key/i,
    );
  });

  it("rejects foreign_key referenced_columns with duplicate ids", () => {
    const project = twoTableProject();
    const order = project.physical_model.tables[1];
    const fk = order.constraints.find((c) => c.kind === "foreign_key");
    order.columns.push({
      id: "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID_2",
      name: "CUSTOMER_ID_2",
      ordinal: 4,
      data_type: numberType(),
      nullable: false,
      default: null,
      comment: null,
    });
    fk.columns = [
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.ORDER_HEADER.CUSTOMER_ID_2",
    ];
    fk.referenced_columns = [
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
      "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
    ];
    const rel = project.physical_model.relationships[0];
    rel.source_column_ids = [...fk.columns];
    rel.target_column_ids = [...fk.referenced_columns];
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /referenced_columns must have unique ids/i,
    );
  });

  it("rejects null catalog or schema on namespace entries", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          project_version: "1",
          physical_model: {
            model_version: "1",
            name: "null-catalog",
            namespaces: [
              { id: "namespace:null.CORE", catalog: null, schema: "CORE" },
            ],
            tables: [],
            relationships: [],
          },
        }),
      /catalog must be a string|catalog must be a legal|identifier/i,
    );

    assert.throws(
      () =>
        canonicalProjectToDiagram({
          project_version: "1",
          physical_model: {
            model_version: "1",
            name: "null-schema",
            namespaces: [
              {
                id: "namespace:ANALYTICS.null",
                catalog: "ANALYTICS",
                schema: null,
              },
            ],
            tables: [],
            relationships: [],
          },
        }),
      /schema must be a string|schema must be a legal|identifier/i,
    );
  });

  it("rejects namespace-only models when catalog and schema are null", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram({
          project_version: "1",
          physical_model: {
            model_version: "1",
            name: "ns-only",
            namespaces: [
              { id: "namespace:null.null", catalog: null, schema: null },
            ],
            tables: [],
            relationships: [],
          },
        }),
      /catalog must be a string|catalog must be a legal|identifier/i,
    );
  });

  it("rejects diagram export uniqueConstraints with duplicate column ids", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: "dup-uq",
          tables: [
            {
              id: 1,
              name: "SAMPLE",
              x: 0,
              y: 0,
              comment: "",
              namespace: {
                id: "namespace:ANALYTICS.CORE",
                catalog: "ANALYTICS",
                schema: "CORE",
              },
              fields: [
                {
                  id: "f1",
                  name: "A",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: true,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
                {
                  id: "f2",
                  name: "B",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: false,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
              ],
              uniqueConstraints: [{ name: "UQ_DUP", fields: ["A", "A"] }],
            },
          ],
          relationships: [],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /unique ids|columns/i,
    );
  });

  it("rejects diagram export relationships with duplicate referenced column ids", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          title: "dup-fk-ref",
          tables: [
            {
              id: 1,
              name: "PARENT",
              x: 0,
              y: 0,
              comment: "",
              namespace: {
                id: "namespace:ANALYTICS.CORE",
                catalog: "ANALYTICS",
                schema: "CORE",
              },
              fields: [
                {
                  id: "p1",
                  name: "ID",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: true,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
              ],
            },
            {
              id: 2,
              name: "CHILD",
              x: 100,
              y: 0,
              comment: "",
              namespace: {
                id: "namespace:ANALYTICS.CORE",
                catalog: "ANALYTICS",
                schema: "CORE",
              },
              fields: [
                {
                  id: "c1",
                  name: "ID",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: true,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
                {
                  id: "c2",
                  name: "P_ID_A",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: false,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
                {
                  id: "c3",
                  name: "P_ID_B",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  primary: false,
                  unique: false,
                  notNull: true,
                  comment: "",
                },
              ],
            },
          ],
          relationships: [
            {
              id: "r1",
              name: "FK_CHILD_PARENT",
              startTableId: 2,
              endTableId: 1,
              fields: [
                { startFieldId: "c2", endFieldId: "p1" },
                { startFieldId: "c3", endFieldId: "p1" },
              ],
            },
          ],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /referenced_columns must have unique ids|unique ids/i,
    );
  });
});

describe("W2A-04 Snowflake CHECK constraint fidelity", () => {
  function v2CheckProject(checkConstraints = [], tableOverrides = {}) {
    return {
      project_version: "1",
      physical_model: {
        model_version: "2",
        name: "CHECK_TEST_MODEL",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.TEST_TABLE",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "TEST_TABLE",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.TEST_TABLE.ID",
                name: "ID",
                ordinal: 1,
                data_type: {
                  family: "NUMBER",
                  text: "NUMBER(38, 0)",
                  precision: 38,
                  scale: 0,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
            ],
            constraints: [],
            check_constraints: checkConstraints,
            comment: null,
            ...tableOverrides,
          },
        ],
        relationships: [],
      },
    };
  }

  function checkDiagram(checks = []) {
    return {
      database: "snowflake",
      title: "CHECK_DIAGRAM",
      tables: [
        {
          id: "tbl-1",
          name: "TEST_TABLE",
          x: 0,
          y: 0,
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "fld-1",
              name: "ID",
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
          ],
          checkConstraints: checks,
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };
  }

  it("validates canonical CHECK entries and rejects malformed entries", () => {
    // Positive cases
    const validNamed = {
      id: "ck-1",
      name: "CK_ID_POSITIVE",
      expression: "ID > 0",
      validation: "VALIDATE",
      name_origin: "explicit",
    };
    const validUnnamed = {
      id: "ck-2",
      name: null,
      expression: "ID <= 100",
      validation: "VALIDATE",
      name_origin: "unnamed",
    };
    const validUnknown = {
      id: "ck-3",
      name: "CK_ID_META",
      expression: "ID != 0",
      validation: "UNKNOWN",
      name_origin: "unknown",
    };
    assert.doesNotThrow(() =>
      canonicalProjectToDiagram(
        v2CheckProject([validNamed, validUnnamed, validUnknown]),
      ),
    );

    // Negative: missing required keys
    for (const key of [
      "id",
      "name",
      "expression",
      "validation",
      "name_origin",
    ]) {
      const bad = { ...validNamed };
      delete bad[key];
      assert.throws(
        () => canonicalProjectToDiagram(v2CheckProject([bad])),
        new RegExp(`check_constraints\\[0\\] is missing required ${key}`),
      );
    }

    // Negative: unexpected extra keys
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, unexpected: true }]),
        ),
      /check_constraints\[0\] has unexpected field unexpected/,
    );

    // Negative: invalid/blank name
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, name: "" }]),
        ),
      /check_constraints\[0\].name must be a nonblank string/,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, name: "lowercase_name" }]),
        ),
      /check_constraints\[0\].name must be a legal uppercase unquoted Snowflake identifier/,
    );

    // Negative: name_origin rules
    // unnamed must have null name
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validUnnamed, name: "CK_NAMED" }]),
        ),
      /check_constraints\[0\]: name_origin "unnamed" requires name to be null/,
    );
    // explicit requires non-null name
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, name: null }]),
        ),
      /check_constraints\[0\]: name_origin "explicit" requires a non-null name/,
    );
    // unknown requires non-null name
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validUnknown, name: null }]),
        ),
      /check_constraints\[0\]: name_origin "unknown" requires a non-null name/,
    );

    // Negative: invalid validation enum
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, validation: "INVALID" }]),
        ),
      /check_constraints\[0\].validation must be "VALIDATE" or "UNKNOWN"/,
    );

    // Negative: invalid name_origin enum
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, name_origin: "custom" }]),
        ),
      /check_constraints\[0\].name_origin must be "explicit", "unnamed", or "unknown"/,
    );

    // Negative: expression validation
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, expression: "  ID > 0  " }]),
        ),
      /check_constraints\[0\].expression must be trimmed/,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, expression: "" }]),
        ),
      /check_constraints\[0\].expression must be a nonblank string/,
    );
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([{ ...validNamed, expression: 123 }]),
        ),
      /check_constraints\[0\].expression must be a nonblank string/,
    );

    // Negative: duplicate IDs within table
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([
            { ...validNamed, id: "dup-id" },
            { ...validUnnamed, id: "dup-id" },
          ]),
        ),
      /check_constraints\[1\].id must be unique/,
    );

    // Negative: unsorted entries
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          v2CheckProject([
            { ...validNamed, id: "z-id" },
            { ...validUnnamed, id: "a-id" },
          ]),
        ),
      /check_constraints must be sorted by id/,
    );
  });

  it("preserves legacy nonblank field.check behavior", () => {
    const diag = checkDiagram();
    diag.tables[0].fields[0].check = "ID > 0";
    assert.throws(
      () => diagramToCanonicalProject(diag),
      (err) => {
        assert.equal(err.code, "LEGACY_FIELD_CHECK_UNSUPPORTED");
        assert.match(
          err.message,
          /Legacy field\.check requires explicit migration/,
        );
        return true;
      },
    );
  });

  it("maps check constraints bidirectionally between diagram and canonical models", () => {
    const editorChecks = [
      {
        id: "check-1",
        name: "CK_TEST_ID",
        expression: "ID > 0",
        validation: "VALIDATE",
        nameOrigin: "explicit",
      },
      {
        id: "check-2",
        name: null,
        expression: "ID < 100",
        validation: "VALIDATE",
        nameOrigin: "unnamed",
      },
    ];

    const diag = checkDiagram(editorChecks);
    const canonical = diagramToCanonicalProject(diag);
    assert.deepEqual(canonical.physical_model.tables[0].check_constraints, [
      {
        id: "check-1",
        name: "CK_TEST_ID",
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
      {
        id: "check-2",
        name: null,
        expression: "ID < 100",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
    ]);

    // Canonical to diagram mapping
    delete canonical.drawdb_document;
    const reopenedDiagram = canonicalProjectToDiagram(canonical);
    assert.deepEqual(reopenedDiagram.tables[0].checkConstraints, editorChecks);
  });

  it("validates checkConstraints in the drawdb_document validator", () => {
    const diag = checkDiagram([
      {
        id: "c1",
        name: "CK_1",
        expression: "ID > 0",
        validation: "VALIDATE",
        nameOrigin: "explicit",
        extra: "bad",
      },
    ]);
    assert.throws(
      () => diagramToCanonicalProject(diag),
      /drawdb_document\.tables\[0\]\.checkConstraints\[0\] has unexpected field extra/,
    );
  });

  it("renders deterministic DDL for named and unnamed CHECK constraints without disable grammar", () => {
    const checks = [
      {
        id: "check-1",
        name: "CK_ID_BOUNDS",
        expression: "ID >= 1 AND ID <= 100",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
      {
        id: "check-2",
        name: null,
        expression: "ID % 2 = 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
    ];
    const project = v2CheckProject(checks);
    const ddl = renderCanonicalSnowflakeDDL(project);
    assert.match(
      ddl,
      /CONSTRAINT CK_ID_BOUNDS CHECK \(ID >= 1 AND ID <= 100\)/,
    );
    assert.match(ddl, /CHECK \(ID % 2 = 0\)/);
    assert.doesNotMatch(
      ddl,
      /\b(?:NOT\s+ENFORCED|RELY|DISABLE)\b/i,
      "CHECK constraints must not have NOT ENFORCED, RELY, or DISABLE",
    );
    assert.equal(ddl, renderCanonicalSnowflakeDDL(project));
  });

  it("parses all four DDL check forms: named, unnamed, column inline, and ALTER ADD", () => {
    const ddl = `
CREATE DATABASE IF NOT EXISTS ANALYTICS;
CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;

CREATE TABLE ANALYTICS.CORE.T1 (
    ID NUMBER(38, 0) NOT NULL CHECK (ID > 0),
    RATE NUMBER(5, 2) NOT NULL,
    CONSTRAINT CK_T1_RATE CHECK (RATE >= 0.0),
    CHECK (RATE <= 100.0)
);

ALTER TABLE ANALYTICS.CORE.T1 ADD CONSTRAINT CK_T1_EXTRA CHECK (ID < 1000);
ALTER TABLE ANALYTICS.CORE.T1 ADD CHECK (RATE != 50.0);
`;
    const project = parseSnowflakeDDLToCanonicalProject(ddl);
    const table = project.physical_model.tables[0];
    const checks = table.check_constraints;

    // Check ids:
    // Unnamed 1: from column inline CHECK (ID > 0) -> check:ANALYTICS.CORE.T1#1
    // Unnamed 2: from table-level CHECK (RATE <= 100.0) -> check:ANALYTICS.CORE.T1#2
    // Unnamed 3: from ALTER TABLE ADD CHECK (RATE != 50.0) -> check:ANALYTICS.CORE.T1#3
    // Named: CK_T1_RATE -> constraint:ANALYTICS.CORE.T1.CK_T1_RATE
    // Named: CK_T1_EXTRA -> constraint:ANALYTICS.CORE.T1.CK_T1_EXTRA
    assert.equal(checks.length, 5);

    const checksById = new Map(checks.map((c) => [c.id, c]));
    assert.deepEqual(checksById.get("check:ANALYTICS.CORE.T1#1"), {
      id: "check:ANALYTICS.CORE.T1#1",
      name: null,
      expression: "ID > 0",
      validation: "VALIDATE",
      name_origin: "unnamed",
    });
    assert.deepEqual(checksById.get("check:ANALYTICS.CORE.T1#2"), {
      id: "check:ANALYTICS.CORE.T1#2",
      name: null,
      expression: "RATE <= 100.0",
      validation: "VALIDATE",
      name_origin: "unnamed",
    });
    assert.deepEqual(checksById.get("check:ANALYTICS.CORE.T1#3"), {
      id: "check:ANALYTICS.CORE.T1#3",
      name: null,
      expression: "RATE != 50.0",
      validation: "VALIDATE",
      name_origin: "unnamed",
    });
    assert.deepEqual(
      checksById.get("constraint:ANALYTICS.CORE.T1.CK_T1_RATE"),
      {
        id: "constraint:ANALYTICS.CORE.T1.CK_T1_RATE",
        name: "CK_T1_RATE",
        expression: "RATE >= 0.0",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
    );
    assert.deepEqual(
      checksById.get("constraint:ANALYTICS.CORE.T1.CK_T1_EXTRA"),
      {
        id: "constraint:ANALYTICS.CORE.T1.CK_T1_EXTRA",
        name: "CK_T1_EXTRA",
        expression: "ID < 1000",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
    );
  });

  it("parses complex check expressions: nested parens, quoted string containing ')' and 'CHECK', and escaped quotes", () => {
    const ddl = `
CREATE DATABASE IF NOT EXISTS ANALYTICS;
CREATE SCHEMA IF NOT EXISTS ANALYTICS.CORE;

CREATE TABLE ANALYTICS.CORE.COMPLEX (
    CODE VARCHAR(50) NOT NULL,
    STATUS VARCHAR(20) NOT NULL,
    CONSTRAINT CK_COMPLEX CHECK (((CODE != ')' AND STATUS != 'CHECK') OR (CODE = 'O''Reilly')) AND NOT (STATUS IS NULL))
);
`;
    const project = parseSnowflakeDDLToCanonicalProject(ddl);
    const check = project.physical_model.tables[0].check_constraints[0];
    assert.equal(
      check.expression,
      "((CODE != ')' AND STATUS != 'CHECK') OR (CODE = 'O''Reilly')) AND NOT (STATUS IS NULL)",
    );
  });

  it("rejects CHECK (...) NOT ENFORCED in all DDL forms", () => {
    const tableNamed = `
CREATE DATABASE IF NOT EXISTS D; CREATE SCHEMA IF NOT EXISTS D.S;
CREATE TABLE D.S.T (ID NUMBER, CONSTRAINT CK_ID CHECK (ID > 0) NOT ENFORCED);
`;
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject(tableNamed),
      /unsupported Snowflake CHECK constraint.*NOT ENFORCED/i,
    );

    const tableUnnamed = `
CREATE DATABASE IF NOT EXISTS D; CREATE SCHEMA IF NOT EXISTS D.S;
CREATE TABLE D.S.T (ID NUMBER, CHECK (ID > 0) NOT ENFORCED);
`;
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject(tableUnnamed),
      /unsupported Snowflake CHECK constraint.*NOT ENFORCED/i,
    );

    const columnInline = `
CREATE DATABASE IF NOT EXISTS D; CREATE SCHEMA IF NOT EXISTS D.S;
CREATE TABLE D.S.T (ID NUMBER CHECK (ID > 0) NOT ENFORCED);
`;
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject(columnInline),
      /unsupported Snowflake column clause.*NOT ENFORCED/i,
    );

    const alterNamed = `
CREATE DATABASE IF NOT EXISTS D; CREATE SCHEMA IF NOT EXISTS D.S;
CREATE TABLE D.S.T (ID NUMBER);
ALTER TABLE D.S.T ADD CONSTRAINT CK_ID CHECK (ID > 0) NOT ENFORCED;
`;
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject(alterNamed),
      /unsupported Snowflake ALTER TABLE statement.*NOT ENFORCED/i,
    );

    const alterUnnamed = `
CREATE DATABASE IF NOT EXISTS D; CREATE SCHEMA IF NOT EXISTS D.S;
CREATE TABLE D.S.T (ID NUMBER);
ALTER TABLE D.S.T ADD CHECK (ID > 0) NOT ENFORCED;
`;
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject(alterUnnamed),
      /unsupported Snowflake ALTER TABLE statement.*NOT ENFORCED/i,
    );
  });

  it("satisfies render -> parse -> render determinism for CHECK constraints", () => {
    const checks = [
      {
        id: "check:ANALYTICS.CORE.T#1",
        name: null,
        expression: "PRICE > 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
      {
        id: "constraint:ANALYTICS.CORE.T.CK_DISCOUNT",
        name: "CK_DISCOUNT",
        expression: "DISCOUNT >= 0 AND DISCOUNT <= 1",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
    ];
    const initialProject = {
      project_version: "1",
      physical_model: {
        model_version: "2",
        name: "ROUNDTRIP_MODEL",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.T",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "T",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.T.PRICE",
                name: "PRICE",
                ordinal: 1,
                data_type: {
                  family: "NUMBER",
                  text: "NUMBER(10, 2)",
                  precision: 10,
                  scale: 2,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.T.DISCOUNT",
                name: "DISCOUNT",
                ordinal: 2,
                data_type: {
                  family: "NUMBER",
                  text: "NUMBER(5, 2)",
                  precision: 5,
                  scale: 2,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
            ],
            constraints: [],
            check_constraints: checks,
            comment: null,
          },
        ],
        relationships: [],
      },
    };

    const rendered1 = renderCanonicalSnowflakeDDL(initialProject);
    const parsed = parseSnowflakeDDLToCanonicalProject(rendered1, {
      name: "ROUNDTRIP_MODEL",
    });
    const rendered2 = renderCanonicalSnowflakeDDL(parsed);
    assert.equal(rendered2, rendered1);
  });
});

describe("W2A-04 cross-array constraint id uniqueness", () => {
  it("rejects a named CHECK whose canonical id collides with a key constraint id", () => {
    const diagram = {
      database: "snowflake",
      title: "COLLIDE",
      tables: [
        {
          id: "t",
          name: "T",
          x: 0,
          y: 0,
          fields: [
            { id: "f", name: "ID", type: "NUMBER", size: "38,0", default: "", check: "", primary: false, unique: false, notNull: true, increment: false, comment: "" },
          ],
          checkConstraints: [
            { id: "check-1", name: "SAME_NAME", expression: "ID > 0", validation: "VALIDATE", nameOrigin: "explicit" },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };
    const project = diagramToCanonicalProject(diagram);
    const table = project.physical_model.tables[0];
    const keyId = table.check_constraints[0].id;
    table.check_constraints = [{ ...table.check_constraints[0], id: keyId }];
    table.constraints = [
      {
        id: keyId,
        name: "SAME_NAME",
        kind: "unique",
        columns: [table.columns[0].id],
        referenced_table_id: null,
        referenced_columns: [],
      },
    ];
    assert.throws(
      () => canonicalProjectToDiagram(project),
      /used by both constraints and check_constraints/,
    );
  });
});

function makeMatrixEditorDiagram(fieldType, fieldSize) {
  const field = {
    id: "column:A.B.T.C",
    name: "C",
    type: fieldType,
    primary: false,
    unique: false,
    notNull: false,
    default: "",
    comment: "",
  };
  if (fieldSize !== undefined) {
    field.size = fieldSize;
  }
  return {
    database: "snowflake",
    title: "TEST_MODEL",
    tables: [
      {
        id: "table:A.B.T",
        name: "T",
        x: 0,
        y: 0,
        namespace: { id: "namespace:A.B", catalog: "A", schema: "B" },
        fields: [field],
        indices: [],
        uniqueConstraints: [],
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

const TYPE_MATRIX = Object.freeze([
  // 1. NUMBER / DECIMAL / DEC / NUMERIC
  // Bare
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
  // (p) default-resolved params
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
  // (p,s) at p=1,38 and s=0,37 and s=min(37,p) edges, plus explicit (10, 2)
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

const TYPE_NEGATIVE_MATRIX = Object.freeze([
  // 1. Params on parameterless families and integer aliases
  Object.freeze({ input: "DATE(1)", family: "DATE", reason: "DATE with argument", editor: { type: "DATE", size: 1 } }),
  Object.freeze({ input: "BOOLEAN(1)", family: "BOOLEAN", reason: "BOOLEAN with argument", editor: { type: "BOOLEAN", size: 1 } }),
  Object.freeze({ input: "FLOAT(1)", family: "FLOAT", reason: "FLOAT with argument", editor: { type: "FLOAT", size: 1 } }),
  Object.freeze({ input: "FLOAT4(1)", family: "FLOAT", reason: "FLOAT4 with argument", editor: { type: "FLOAT4", size: 1 } }),
  Object.freeze({ input: "FLOAT8(1)", family: "FLOAT", reason: "FLOAT8 with argument", editor: { type: "FLOAT8", size: 1 } }),
  Object.freeze({ input: "DOUBLE(1)", family: "FLOAT", reason: "DOUBLE with argument", editor: { type: "DOUBLE", size: 1 } }),
  Object.freeze({ input: "DOUBLE PRECISION(1)", family: "FLOAT", reason: "DOUBLE PRECISION with argument", editor: { type: "DOUBLE PRECISION", size: 1 } }),
  Object.freeze({ input: "REAL(1)", family: "FLOAT", reason: "REAL with argument", editor: { type: "REAL", size: 1 } }),
  Object.freeze({ input: "VARIANT(1)", family: "VARIANT", reason: "VARIANT with argument", editor: { type: "VARIANT", size: 1 } }),
  Object.freeze({ input: "OBJECT(1)", family: "OBJECT", reason: "OBJECT with numeric argument", editor: { type: "OBJECT", size: 1 } }),
  Object.freeze({ input: "ARRAY(1)", family: "ARRAY", reason: "ARRAY with numeric argument", editor: { type: "ARRAY", size: 1 } }),
  Object.freeze({ input: "GEOGRAPHY(1)", family: "GEOGRAPHY", reason: "GEOGRAPHY with argument", editor: { type: "GEOGRAPHY", size: 1 } }),
  Object.freeze({ input: "GEOMETRY(1)", family: "GEOMETRY", reason: "GEOMETRY with argument", editor: { type: "GEOMETRY", size: 1 } }),

  Object.freeze({ input: "INT(10)", family: "NUMBER", reason: "INT with argument", editor: { type: "INT", size: 10 } }),
  Object.freeze({ input: "INTEGER(10)", family: "NUMBER", reason: "INTEGER with argument", editor: { type: "INTEGER", size: 10 } }),
  Object.freeze({ input: "BIGINT(10)", family: "NUMBER", reason: "BIGINT with argument", editor: { type: "BIGINT", size: 10 } }),
  Object.freeze({ input: "SMALLINT(10)", family: "NUMBER", reason: "SMALLINT with argument", editor: { type: "SMALLINT", size: 10 } }),
  Object.freeze({ input: "TINYINT(10)", family: "NUMBER", reason: "TINYINT with argument", editor: { type: "TINYINT", size: 10 } }),
  Object.freeze({ input: "BYTEINT(10)", family: "NUMBER", reason: "BYTEINT with argument", editor: { type: "BYTEINT", size: 10 } }),

  // 2. NUMBER p=0/39, s=-1/38, s>p
  Object.freeze({ input: "NUMBER(0)", family: "NUMBER", reason: "NUMBER p=0 below minimum", editor: { type: "NUMBER", size: "0,0" } }),
  Object.freeze({ input: "NUMBER(39)", family: "NUMBER", reason: "NUMBER p=39 above maximum", editor: { type: "NUMBER", size: "39,0" } }),
  Object.freeze({ input: "NUMBER(38, -1)", family: "NUMBER", reason: "NUMBER s=-1 below minimum", editor: { type: "NUMBER", size: "38,-1" } }),
  Object.freeze({ input: "NUMBER(38, 38)", family: "NUMBER", reason: "NUMBER s=38 above maximum", editor: { type: "NUMBER", size: "38,38" } }),
  Object.freeze({ input: "NUMBER(10, 11)", family: "NUMBER", reason: "NUMBER s>p", editor: { type: "NUMBER", size: "10,11" } }),
  Object.freeze({ input: "DECIMAL(0, 0)", family: "NUMBER", reason: "DECIMAL p=0", editor: { type: "DECIMAL", size: "0,0" } }),
  Object.freeze({ input: "DECIMAL(39, 0)", family: "NUMBER", reason: "DECIMAL p=39", editor: { type: "DECIMAL", size: "39,0" } }),
  Object.freeze({ input: "DECIMAL(5, 6)", family: "NUMBER", reason: "DECIMAL s>p", editor: { type: "DECIMAL", size: "5,6" } }),
  Object.freeze({ input: "NUMERIC(0, 0)", family: "NUMBER", reason: "NUMERIC p=0", editor: { type: "NUMERIC", size: "0,0" } }),
  Object.freeze({ input: "NUMERIC(39, 0)", family: "NUMBER", reason: "NUMERIC p=39", editor: { type: "NUMERIC", size: "39,0" } }),
  Object.freeze({ input: "NUMERIC(5, 6)", family: "NUMBER", reason: "NUMERIC s>p", editor: { type: "NUMERIC", size: "5,6" } }),

  // 3. VARCHAR 0 and 134217729
  Object.freeze({ input: "VARCHAR(0)", family: "VARCHAR", reason: "VARCHAR length 0 below minimum", editor: { type: "VARCHAR", size: 0 } }),
  Object.freeze({ input: "VARCHAR(134217729)", family: "VARCHAR", reason: "VARCHAR length 134217729 above maximum", editor: { type: "VARCHAR", size: 134217729 } }),
  Object.freeze({ input: "STRING(0)", family: "VARCHAR", reason: "STRING length 0", editor: { type: "STRING", size: 0 } }),
  Object.freeze({ input: "STRING(134217729)", family: "VARCHAR", reason: "STRING length 134217729", editor: { type: "STRING", size: 134217729 } }),
  Object.freeze({ input: "CHAR(0)", family: "VARCHAR", reason: "CHAR length 0", editor: { type: "CHAR", size: 0 } }),
  Object.freeze({ input: "CHAR(134217729)", family: "VARCHAR", reason: "CHAR length 134217729", editor: { type: "CHAR", size: 134217729 } }),

  // 4. BINARY 0 and 67108865
  Object.freeze({ input: "BINARY(0)", family: "BINARY", reason: "BINARY length 0 below minimum", editor: { type: "BINARY", size: 0 } }),
  Object.freeze({ input: "BINARY(67108865)", family: "BINARY", reason: "BINARY length 67108865 above maximum", editor: { type: "BINARY", size: 67108865 } }),
  Object.freeze({ input: "VARBINARY(0)", family: "BINARY", reason: "VARBINARY length 0", editor: { type: "VARBINARY", size: 0 } }),
  Object.freeze({ input: "VARBINARY(67108865)", family: "BINARY", reason: "VARBINARY length 67108865", editor: { type: "VARBINARY", size: 67108865 } }),

  // 5. TIME/TIMESTAMP precision -1/10
  Object.freeze({ input: "TIME(-1)", family: "TIME", reason: "TIME precision -1 below minimum", editor: { type: "TIME", size: -1 } }),
  Object.freeze({ input: "TIME(10)", family: "TIME", reason: "TIME precision 10 above maximum", editor: { type: "TIME", size: 10 } }),
  Object.freeze({ input: "TIMESTAMP_NTZ(-1)", family: "TIMESTAMP_NTZ", reason: "TIMESTAMP_NTZ precision -1", editor: { type: "TIMESTAMP_NTZ", size: -1 } }),
  Object.freeze({ input: "TIMESTAMP_NTZ(10)", family: "TIMESTAMP_NTZ", reason: "TIMESTAMP_NTZ precision 10", editor: { type: "TIMESTAMP_NTZ", size: 10 } }),
  Object.freeze({ input: "TIMESTAMP_LTZ(-1)", family: "TIMESTAMP_LTZ", reason: "TIMESTAMP_LTZ precision -1", editor: { type: "TIMESTAMP_LTZ", size: -1 } }),
  Object.freeze({ input: "TIMESTAMP_LTZ(10)", family: "TIMESTAMP_LTZ", reason: "TIMESTAMP_LTZ precision 10", editor: { type: "TIMESTAMP_LTZ", size: 10 } }),
  Object.freeze({ input: "TIMESTAMP_TZ(-1)", family: "TIMESTAMP_TZ", reason: "TIMESTAMP_TZ precision -1", editor: { type: "TIMESTAMP_TZ", size: -1 } }),
  Object.freeze({ input: "TIMESTAMP_TZ(10)", family: "TIMESTAMP_TZ", reason: "TIMESTAMP_TZ precision 10", editor: { type: "TIMESTAMP_TZ", size: 10 } }),

  // 6. Non-integer args (1.5, 1e3, "abc")
  Object.freeze({ input: "NUMBER(1.5)", family: "NUMBER", reason: "NUMBER non-integer precision 1.5", editor: { type: "NUMBER", size: "1.5,0" } }),
  Object.freeze({ input: "NUMBER(10, 1.5)", family: "NUMBER", reason: "NUMBER non-integer scale 1.5", editor: { type: "NUMBER", size: "10,1.5" } }),
  Object.freeze({ input: "NUMBER(1e3)", family: "NUMBER", reason: "NUMBER scientific notation 1e3", editor: { type: "NUMBER", size: "1e3,0" } }),
  Object.freeze({ input: "NUMBER(abc)", family: "NUMBER", reason: "NUMBER alpha string abc", editor: { type: "NUMBER", size: "abc,0" } }),
  Object.freeze({ input: "VARCHAR(1.5)", family: "VARCHAR", reason: "VARCHAR float length 1.5", editor: { type: "VARCHAR", size: 1.5 } }),
  Object.freeze({ input: "VARCHAR(1e3)", family: "VARCHAR", reason: "VARCHAR exponent length 1e3", editor: null }),
  Object.freeze({ input: "VARCHAR(abc)", family: "VARCHAR", reason: "VARCHAR alpha string abc", editor: { type: "VARCHAR", size: "abc" } }),
  Object.freeze({ input: "TIME(1.5)", family: "TIME", reason: "TIME float precision 1.5", editor: { type: "TIME", size: 1.5 } }),
  Object.freeze({ input: "TIMESTAMP_NTZ(abc)", family: "TIMESTAMP_NTZ", reason: "TIMESTAMP_NTZ alpha precision abc", editor: { type: "TIMESTAMP_NTZ", size: "abc" } }),

  // 7. Empty parens
  Object.freeze({ input: "NUMBER()", family: "NUMBER", reason: "NUMBER empty parentheses", editor: null }),
  Object.freeze({ input: "VARCHAR()", family: "VARCHAR", reason: "VARCHAR empty parentheses", editor: null }),
  Object.freeze({ input: "BINARY()", family: "BINARY", reason: "BINARY empty parentheses", editor: null }),
  Object.freeze({ input: "TIME()", family: "TIME", reason: "TIME empty parentheses", editor: null }),
  Object.freeze({ input: "TIMESTAMP_NTZ()", family: "TIMESTAMP_NTZ", reason: "TIMESTAMP_NTZ empty parentheses", editor: null }),

  // 8. Three args
  Object.freeze({ input: "NUMBER(10, 2, 3)", family: "NUMBER", reason: "NUMBER three arguments", editor: { type: "NUMBER", size: "10,2,3" } }),
  Object.freeze({ input: "VARCHAR(10, 20, 30)", family: "VARCHAR", reason: "VARCHAR three arguments", editor: { type: "VARCHAR", size: "10,20,30" } }),
  Object.freeze({ input: "TIME(1, 2, 3)", family: "TIME", reason: "TIME three arguments", editor: { type: "TIME", size: "1,2,3" } }),

  // 9. VECTOR bare, one arg, three args, element NUMBER/STRING, dimension 0/4097/2.5
  Object.freeze({ input: "VECTOR", family: "VECTOR", reason: "VECTOR bare unresolved in DDL", editor: null }),
  Object.freeze({ input: "VECTOR(INT)", family: "VECTOR", reason: "VECTOR single argument", editor: { type: "VECTOR", size: "INT" } }),
  Object.freeze({ input: "VECTOR(INT, 3, 4)", family: "VECTOR", reason: "VECTOR three arguments", editor: { type: "VECTOR", size: "INT,3,4" } }),
  Object.freeze({ input: "VECTOR(NUMBER, 3)", family: "VECTOR", reason: "VECTOR element type NUMBER unsupported", editor: { type: "VECTOR", size: "NUMBER,3" } }),
  Object.freeze({ input: "VECTOR(STRING, 3)", family: "VECTOR", reason: "VECTOR element type STRING unsupported", editor: { type: "VECTOR", size: "STRING,3" } }),
  Object.freeze({ input: "VECTOR(INT, 0)", family: "VECTOR", reason: "VECTOR dimension 0 below minimum", editor: { type: "VECTOR", size: "INT,0" } }),
  Object.freeze({ input: "VECTOR(FLOAT, 4097)", family: "VECTOR", reason: "VECTOR dimension 4097 above maximum", editor: { type: "VECTOR", size: "FLOAT,4097" } }),
  Object.freeze({ input: "VECTOR(INT, 2.5)", family: "VECTOR", reason: "VECTOR non-integer dimension 2.5", editor: { type: "VECTOR", size: "INT,2.5" } }),

  // 10. Structured OBJECT(...)/ARRAY(...)
  Object.freeze({ input: "OBJECT(a INT)", family: "OBJECT", reason: "structured OBJECT with field schema", editor: null }),
  Object.freeze({ input: "ARRAY(VARCHAR)", family: "ARRAY", reason: "structured ARRAY with element schema", editor: null }),
  Object.freeze({ input: "ARRAY(INT)", family: "ARRAY", reason: "structured ARRAY with element schema", editor: null }),

  // 11. DECFLOAT, MAP, FILE, UUID
  Object.freeze({ input: "DECFLOAT", family: "DECFLOAT", reason: "DECFLOAT unsupported type", editor: { type: "DECFLOAT" } }),
  Object.freeze({ input: "MAP", family: "MAP", reason: "MAP unsupported type", editor: { type: "MAP" } }),
  Object.freeze({ input: "FILE", family: "FILE", reason: "FILE unsupported type", editor: { type: "FILE" } }),
  Object.freeze({ input: "UUID", family: "UUID", reason: "UUID unsupported type", editor: { type: "UUID" } }),

  // 12. Invalid timestampTypeMapping
  Object.freeze({
    input: "TIMESTAMP",
    family: "TIMESTAMP",
    reason: "invalid timestampTypeMapping INVALID_MAPPING",
    options: { timestampTypeMapping: "INVALID_MAPPING" },
    editorOptions: { type: "TIMESTAMP", options: { timestampTypeMapping: "INVALID_MAPPING" } },
  }),
  Object.freeze({
    input: "TIMESTAMP",
    family: "TIMESTAMP",
    reason: "invalid timestampTypeMapping TIMESTAMP_XYZ",
    options: { timestampTypeMapping: "TIMESTAMP_XYZ" },
    editorOptions: { type: "TIMESTAMP", options: { timestampTypeMapping: "TIMESTAMP_XYZ" } },
  }),
]);

describe("Snowflake TYPE_MATRIX deterministic semantic coverage", () => {
  for (const row of TYPE_MATRIX) {
    const literalExpected = Object.freeze({
      family: row.family,
      text: row.text,
      precision: row.precision,
      scale: row.scale,
      length: row.length,
      vector_element_type: row.vector_element_type,
      vector_dimension: row.vector_dimension,
    });

    it(`preserves semantic type for ${row.input} via DDL and editor boundaries`, () => {
      // DDL boundary
      const ddlOptions = { name: "T" };
      if (row.timestampTypeMapping) {
        ddlOptions.timestampTypeMapping = row.timestampTypeMapping;
      }
      const ddlSql = `CREATE TABLE A.B.T (C ${row.input});`;
      const project = parseSnowflakeDDLToCanonicalProject(ddlSql, ddlOptions);
      const actualDataType = project.physical_model.tables[0].columns[0].data_type;
      assert.deepEqual(actualDataType, literalExpected);

      const rendered = renderCanonicalSnowflakeDDL(project);
      assert.ok(
        rendered.includes(`C ${row.text}`),
        `Rendered DDL missing "C ${row.text}":\n${rendered}`,
      );

      const reparsed = parseSnowflakeDDLToCanonicalProject(rendered, { name: "T" });
      assert.deepEqual(
        reparsed.physical_model.tables[0].columns[0].data_type,
        literalExpected,
      );

      // Editor boundary where representable
      if (row.editorRepresentable) {
        const diagram = makeMatrixEditorDiagram(row.editorType, row.editorSize);
        const editorProject = diagramToCanonicalProject(diagram);
        const editorDataType =
          editorProject.physical_model.tables[0].columns[0].data_type;
        assert.deepEqual(editorDataType, literalExpected);

        const backDiag = canonicalProjectToDiagram({
          project_version: "1",
          physical_model: editorProject.physical_model,
        });
        assert.equal(backDiag.tables[0].fields[0].size, row.expectedSize);
      }
    });
  }
});

describe("Snowflake TYPE_NEGATIVE_MATRIX invalid type combinations", () => {
  for (const row of TYPE_NEGATIVE_MATRIX) {
    it(`rejects ${row.input} (${row.reason}) at DDL and editor boundaries`, () => {
      const baseName = row.input.replace(/\(.*?\)/g, "").trim();
      const pattern = new RegExp(`(${row.family}|${baseName}|unsupported)`, "i");

      // DDL boundary
      const ddlOptions = { name: "T", ...(row.options || {}) };
      assert.throws(
        () =>
          parseSnowflakeDDLToCanonicalProject(
            `CREATE TABLE A.B.T (C ${row.input});`,
            ddlOptions,
          ),
        (err) => {
          assert.ok(err instanceof Error);
          assert.ok(err.message && err.message.trim().length > 0);
          assert.match(err.message, pattern);
          return true;
        },
      );

      // Editor boundary where expressible
      if (row.editor) {
        const diag = makeMatrixEditorDiagram(row.editor.type, row.editor.size);
        assert.throws(
          () => diagramToCanonicalProject(diag),
          (err) => {
            assert.ok(err instanceof Error);
            assert.ok(err.message && err.message.trim().length > 0);
            assert.match(err.message, pattern);
            return true;
          },
        );
      } else if (row.editorOptions) {
        assert.throws(
          () =>
            snowflakeTypeFromField(
              { type: row.editorOptions.type },
              row.editorOptions.options,
            ),
          (err) => {
            assert.ok(err instanceof Error);
            assert.ok(err.message && err.message.trim().length > 0);
            assert.match(err.message, pattern);
            return true;
          },
        );
      }
    });
  }
});

describe("Snowflake cross-boundary type consistency", () => {
  for (const row of TYPE_MATRIX) {
    if (!row.editorRepresentable) continue;

    const literalExpected = Object.freeze({
      family: row.family,
      text: row.text,
      precision: row.precision,
      scale: row.scale,
      length: row.length,
      vector_element_type: row.vector_element_type,
      vector_dimension: row.vector_dimension,
    });

    it(`maintains canonical deepEqual parity across DDL and editor for ${row.input}`, () => {
      const ddlOptions = { name: "T" };
      if (row.timestampTypeMapping) {
        ddlOptions.timestampTypeMapping = row.timestampTypeMapping;
      }
      const ddlProject = parseSnowflakeDDLToCanonicalProject(
        `CREATE TABLE A.B.T (C ${row.input});`,
        ddlOptions,
      );
      const ddlCol = ddlProject.physical_model.tables[0].columns[0].data_type;

      const editorProject = diagramToCanonicalProject(
        makeMatrixEditorDiagram(row.editorType, row.editorSize),
      );
      const editorCol = editorProject.physical_model.tables[0].columns[0].data_type;

      assert.deepEqual(ddlCol, editorCol);
      assert.deepEqual(ddlCol, literalExpected);
      assert.deepEqual(editorCol, literalExpected);
    });
  }
});

const { assertSemanticEqual } = await import("../../tests/wave2a-01-parity.mjs");
const { openDesktopProject } = await import("./desktopBridge.js");

const CHECK_EXPRESSION_MATRIX = [
  { label: "simple comparison", expression: "AMOUNT >= 0" },
  { label: "AND/OR/NOT", expression: "STATUS = 'ACTIVE' AND NOT (FLAG = 'N' OR FLAG IS NULL)" },
  { label: "IN list", expression: "STATUS IN ('A', 'B', 'C')" },
  { label: "BETWEEN", expression: "AGE BETWEEN 18 AND 65" },
  { label: "LIKE with % and _", expression: "CODE LIKE 'PRE_%_POST%'" },
  { label: "nested parens 3 deep", expression: "(((VAL + 1) * 2) > 10)" },
  { label: "string literal containing )", expression: "MSG <> 'closing ) paren'" },
  { label: "string literal containing CHECK (", expression: "NAME <> 'CHECK (foo)'" },
  { label: "string with '' escape", expression: "NOTE <> 'it''s a quote'" },
  { label: "CASE WHEN", expression: "CASE WHEN FLAG = 1 THEN SCORE > 50 ELSE SCORE <= 50 END" },
  { label: "function calls with nested args", expression: "COALESCE(NULLIF(TRIM(NAME), ''), 'DEFAULT') <> 'INVALID'" },
  { label: "multi-line with tabs and newlines inside", expression: "AMOUNT > 0\n\tAND SCORE < 100" },
  {
    label: "leading/trailing whitespace (assert trimmed)",
    expression: "QTY > 0",
    untrimmedDdl: "CHECK (   QTY > 0   )",
    untrimmedEditor: "   QTY > 0   ",
  },
  { label: "unicode in string", expression: "GREETING IN ('👋', 'こんにちは', '🎉')" },
  { label: "column name that does not exist (opaque, must be accepted)", expression: "NONEXISTENT_COL > 42" },
  { label: "expression referencing two columns", expression: "START_TIME <= END_TIME" },
  { label: "arithmetic multiplication", expression: "WIDTH * HEIGHT <= 10000" },
  { label: "IS NOT NULL", expression: "EMAIL IS NOT NULL" },
  { label: "string concatenation", expression: "PREFIX || '-' || SUFFIX <> 'FOO-BAR'" },
  { label: "compound conditions", expression: "(A > 0 AND B > 0) OR (C > 0 AND D > 0)" },
  { label: "date function", expression: "DATEDIFF('day', START_DATE, END_DATE) >= 0" },
  { label: "math function", expression: "ABS(DELTA) < 0.001" },
  { label: "string with escaped quotes and parens combined", expression: "TITLE <> 'Don''t (panic)'" },
  { label: "nested CASE", expression: "CASE WHEN X > 0 THEN (CASE WHEN Y > 0 THEN 1 ELSE 0 END) ELSE -1 END >= 0" },
  { label: "regex pattern", expression: "REGEXP_LIKE(ZIP, '^\\d{5}$')" },
  { label: "string length", expression: "LENGTH(DESCRIPTION) <= 500" },
  { label: "array predicate and cast", expression: "ARRAY_CONTAINS('ADMIN'::VARIANT, ROLES)" },
  { label: "range comparison", expression: "DISCOUNT >= 0.00 AND DISCOUNT <= 1.00" },
  { label: "IFF function", expression: "IFF(PRIORITY = 1, WEIGHT > 10, WEIGHT > 0)" },
  { label: "date extract function", expression: "YEAR(BIRTH_DATE) >= 1900" },
];

function makeCheckMatrixEditorDiagram(check) {
  return {
    database: "snowflake",
    title: "CHECK_MATRIX_MODEL",
    tables: [
      {
        id: "table-1",
        name: "TEST_TABLE",
        x: 0,
        y: 0,
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        fields: [
          {
            id: "field-1",
            name: "ID",
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
        ],
        checkConstraints: [check],
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

describe("Snowflake CHECK expression matrix", () => {
  CHECK_EXPRESSION_MATRIX.forEach((row, index) => {
    it(`round-trips named variant for ${row.label}`, () => {
      const namedEditorCheck = {
        id: `ck-named-${index}`,
        name: `CK_NAMED_${index}`,
        expression: row.expression,
        validation: "VALIDATE",
        nameOrigin: "explicit",
      };
      const editorDiagram = makeCheckMatrixEditorDiagram(namedEditorCheck);
      const canonicalProject = diagramToCanonicalProject(editorDiagram);

      const expectedLiteral = [
        {
          id: `ck-named-${index}`,
          name: `CK_NAMED_${index}`,
          expression: row.expression,
          validation: "VALIDATE",
          name_origin: "explicit",
        },
      ];
      assert.deepEqual(
        canonicalProject.physical_model.tables[0].check_constraints,
        expectedLiteral,
      );

      const ddl = renderCanonicalSnowflakeDDL(canonicalProject);
      assert.ok(
        ddl.includes(`CHECK (${row.expression})`),
        `DDL must contain exact CHECK expression for ${row.label}`,
      );
      assert.ok(
        ddl.includes(`CONSTRAINT CK_NAMED_${index} CHECK (${row.expression})`),
        `DDL must contain named CONSTRAINT definition for ${row.label}`,
      );

      const parsedProject = parseSnowflakeDDLToCanonicalProject(ddl, {
        name: canonicalProject.physical_model.name,
      });
      assertSemanticEqual(assert, parsedProject, canonicalProject);

      const ddlAgain = renderCanonicalSnowflakeDDL(parsedProject);
      assert.equal(ddlAgain, ddl);
    });

    it(`round-trips unnamed variant for ${row.label}`, () => {
      const unnamedEditorCheck = {
        id: `ck-unnamed-${index}`,
        name: null,
        expression: row.expression,
        validation: "VALIDATE",
        nameOrigin: "unnamed",
      };
      const editorDiagram = makeCheckMatrixEditorDiagram(unnamedEditorCheck);
      const canonicalProject = diagramToCanonicalProject(editorDiagram);

      const expectedLiteral = [
        {
          id: `ck-unnamed-${index}`,
          name: null,
          expression: row.expression,
          validation: "VALIDATE",
          name_origin: "unnamed",
        },
      ];
      assert.deepEqual(
        canonicalProject.physical_model.tables[0].check_constraints,
        expectedLiteral,
      );

      const ddl = renderCanonicalSnowflakeDDL(canonicalProject);
      assert.ok(
        ddl.includes(`CHECK (${row.expression})`),
        `DDL must contain exact CHECK expression for ${row.label}`,
      );

      const parsedProject = parseSnowflakeDDLToCanonicalProject(ddl, {
        name: canonicalProject.physical_model.name,
      });
      assertSemanticEqual(assert, parsedProject, canonicalProject);

      const ddlAgain = renderCanonicalSnowflakeDDL(parsedProject);
      assert.equal(ddlAgain, ddl);
    });

    if (row.untrimmedDdl) {
      it(`asserts leading/trailing whitespace is trimmed on DDL parse for ${row.label}`, () => {
        const ddlWithWhitespace = `CREATE TABLE ANALYTICS.CORE.TEST_TABLE (ID NUMBER(38, 0), ${row.untrimmedDdl});`;
        const parsed = parseSnowflakeDDLToCanonicalProject(ddlWithWhitespace);
        assert.equal(
          parsed.physical_model.tables[0].check_constraints[0].expression,
          row.expression,
        );
      });
    }

    if (row.untrimmedEditor) {
      it(`asserts untrimmed expression in editor diagram throws for ${row.label}`, () => {
        const badEditorCheck = {
          id: `ck-bad-${index}`,
          name: `CK_BAD_${index}`,
          expression: row.untrimmedEditor,
          validation: "VALIDATE",
          nameOrigin: "explicit",
        };
        assert.throws(
          () => diagramToCanonicalProject(makeCheckMatrixEditorDiagram(badEditorCheck)),
          /must be trimmed/i,
        );
      });
    }
  });
});

function makeCanonicalProjectForCheckValidation(check) {
  return {
    project_version: "1",
    physical_model: {
      model_version: "2",
      name: "VALIDATION_MODEL",
      namespaces: [
        { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
      ],
      tables: [
        {
          id: "table:ANALYTICS.CORE.TEST_TABLE",
          namespace_id: "namespace:ANALYTICS.CORE",
          name: "TEST_TABLE",
          kind: "table",
          columns: [
            {
              id: "column:ANALYTICS.CORE.TEST_TABLE.ID",
              name: "ID",
              ordinal: 1,
              data_type: {
                family: "NUMBER",
                text: "NUMBER(38, 0)",
                precision: 38,
                scale: 0,
                length: null,
                vector_element_type: null,
                vector_dimension: null,
              },
              nullable: false,
              default: null,
              comment: null,
            },
          ],
          constraints: [],
          check_constraints: [check],
          comment: null,
        },
      ],
      relationships: [],
    },
    diagram_layout: {
      nodes: {},
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

describe("Snowflake CHECK negative rows", () => {
  it("rejects empty CHECK () in DDL", () => {
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject("CREATE TABLE A.B.T (ID NUMBER, CHECK ());"),
      /CHECK constraint expression must not be empty/i,
    );
  });

  it("rejects unterminated string in CHECK in DDL", () => {
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject("CREATE TABLE A.B.T (ID NUMBER, CHECK (VAL = 'abc));"),
      /unterminated/i,
    );
  });

  it("rejects unbalanced parens in CHECK in DDL", () => {
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject("CREATE TABLE A.B.T (ID NUMBER, CHECK ((VAL = 1));"),
      /unterminated/i,
    );
  });

  it("rejects CHECK (x) NOT ENFORCED in DDL", () => {
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject("CREATE TABLE A.B.T (ID NUMBER, CHECK (ID > 0) NOT ENFORCED);"),
      /unexpected NOT ENFORCED/i,
    );
  });

  it("rejects CHECK (x) RELY in DDL", () => {
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject("CREATE TABLE A.B.T (ID NUMBER, CHECK (ID > 0) RELY);"),
      /RELY constraints are not imported|unexpected RELY/i,
    );
  });

  it("rejects CHECK (x) DISABLE in DDL", () => {
    assert.throws(
      () => parseSnowflakeDDLToCanonicalProject("CREATE TABLE A.B.T (ID NUMBER, CHECK (ID > 0) DISABLE);"),
      /unexpected DISABLE/i,
    );
  });

  it("rejects duplicate named checks in DDL", () => {
    assert.throws(
      () =>
        parseSnowflakeDDLToCanonicalProject(
          "CREATE TABLE A.B.T (ID NUMBER, CONSTRAINT CK_1 CHECK (ID > 0), CONSTRAINT CK_1 CHECK (ID < 100));",
        ),
      /duplicate.*id|must be unique|sorted/i,
    );
  });

  it("rejects duplicate named checks in editor diagram", () => {
    assert.throws(
      () =>
        diagramToCanonicalProject({
          database: "snowflake",
          title: "T",
          tables: [
            {
              id: "t1",
              name: "T",
              x: 0,
              y: 0,
              fields: [
                {
                  id: "f1",
                  name: "C",
                  type: "NUMBER",
                  size: "38,0",
                  default: "",
                  check: "",
                  primary: false,
                  unique: false,
                  notNull: false,
                  increment: false,
                  comment: "",
                },
              ],
              checkConstraints: [
                {
                  id: "ck-1",
                  name: "CK_DUP",
                  expression: "C > 0",
                  validation: "VALIDATE",
                  nameOrigin: "explicit",
                },
                {
                  id: "ck-1",
                  name: "CK_DUP",
                  expression: "C < 100",
                  validation: "VALIDATE",
                  nameOrigin: "explicit",
                },
              ],
            },
          ],
          relationships: [],
          transform: { pan: { x: 0, y: 0 }, zoom: 1 },
        }),
      /must be unique|duplicate/i,
    );
  });

  for (const key of ["id", "name", "expression", "validation", "name_origin"]) {
    it(`rejects canonical CHECK entry missing key '${key}'`, () => {
      const check = {
        id: "check:ANALYTICS.CORE.TEST_TABLE#1",
        name: null,
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      };
      delete check[key];
      assert.throws(
        () => canonicalProjectToDiagram(makeCanonicalProjectForCheckValidation(check)),
        /missing required|unexpected/i,
      );
    });
  }

  for (const key of ["id", "name", "expression", "validation", "nameOrigin"]) {
    it(`rejects editor CHECK entry missing key '${key}'`, () => {
      const baseDoc = {
        database: "snowflake",
        title: "T",
        tables: [
          {
            id: "t1",
            name: "T",
            x: 0,
            y: 0,
            fields: [
              {
                id: "f1",
                name: "C",
                type: "NUMBER",
                size: "38,0",
                default: "",
                check: "",
                primary: false,
                unique: false,
                notNull: false,
                increment: false,
                comment: "",
              },
            ],
            checkConstraints: [
              {
                id: "ck-1",
                name: null,
                expression: "C > 0",
                validation: "VALIDATE",
                nameOrigin: "unnamed",
              },
            ],
          },
        ],
        relationships: [],
        transform: { pan: { x: 0, y: 0 }, zoom: 1 },
      };
      delete baseDoc.tables[0].checkConstraints[0][key];
      const p = makeCanonicalProjectForCheckValidation({
        id: "check:ANALYTICS.CORE.TEST_TABLE#1",
        name: null,
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      });
      p.drawdb_document = baseDoc;
      assert.throws(
        () => canonicalProjectToDiagram(p),
        /is missing required|missing required/i,
      );
    });
  }

  it("rejects invalid validation values in canonical and editor checks", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          makeCanonicalProjectForCheckValidation({
            id: "check:ANALYTICS.CORE.TEST_TABLE#1",
            name: null,
            expression: "ID > 0",
            validation: "INVALID",
            name_origin: "unnamed",
          }),
        ),
      /validation must be "VALIDATE" or "UNKNOWN"/i,
    );
    assert.throws(
      () =>
        diagramToCanonicalProject(
          makeCheckMatrixEditorDiagram({
            id: "ck-1",
            name: null,
            expression: "ID > 0",
            validation: "INVALID",
            nameOrigin: "unnamed",
          }),
        ),
      /validation must be "VALIDATE" or "UNKNOWN"/i,
    );
  });

  it("rejects invalid name_origin and nameOrigin values in canonical and editor checks", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          makeCanonicalProjectForCheckValidation({
            id: "check:ANALYTICS.CORE.TEST_TABLE#1",
            name: null,
            expression: "ID > 0",
            validation: "VALIDATE",
            name_origin: "invalid",
          }),
        ),
      /name_origin must be "explicit", "unnamed", or "unknown"/i,
    );
    assert.throws(
      () =>
        diagramToCanonicalProject(
          makeCheckMatrixEditorDiagram({
            id: "ck-1",
            name: null,
            expression: "ID > 0",
            validation: "VALIDATE",
            nameOrigin: "invalid",
          }),
        ),
      /name_origin must be "explicit", "unnamed", or "unknown"|nameOrigin/i,
    );
  });

  it("rejects name present with name_origin unnamed in canonical and editor checks", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          makeCanonicalProjectForCheckValidation({
            id: "check:ANALYTICS.CORE.TEST_TABLE#1",
            name: "CK_NAME",
            expression: "ID > 0",
            validation: "VALIDATE",
            name_origin: "unnamed",
          }),
        ),
      /name_origin "unnamed" requires name to be null/i,
    );
    assert.throws(
      () =>
        diagramToCanonicalProject(
          makeCheckMatrixEditorDiagram({
            id: "ck-1",
            name: "CK_NAME",
            expression: "ID > 0",
            validation: "VALIDATE",
            nameOrigin: "unnamed",
          }),
        ),
      /name_origin "unnamed" requires name to be null|nameOrigin/i,
    );
  });

  it("rejects name null with name_origin explicit in canonical and editor checks", () => {
    assert.throws(
      () =>
        canonicalProjectToDiagram(
          makeCanonicalProjectForCheckValidation({
            id: "constraint:ANALYTICS.CORE.TEST_TABLE.CK_NAME",
            name: null,
            expression: "ID > 0",
            validation: "VALIDATE",
            name_origin: "explicit",
          }),
        ),
      /name_origin "explicit" requires a non-null name/i,
    );
    assert.throws(
      () =>
        diagramToCanonicalProject(
          makeCheckMatrixEditorDiagram({
            id: "ck-1",
            name: null,
            expression: "ID > 0",
            validation: "VALIDATE",
            nameOrigin: "explicit",
          }),
        ),
      /name_origin "explicit" requires a non-null name|nameOrigin/i,
    );
  });
});

async function openSerializedProjectForTest(serialized) {
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

describe("Snowflake CHECK silent-loss matrix", () => {
  it("preserves CHECK constraints across editor -> canonical -> editor boundary", () => {
    const initialDiagram = {
      database: "snowflake",
      title: "SILENT_LOSS_MODEL",
      tables: [
        {
          id: "table:ANALYTICS.CORE.PAYMENTS",
          name: "PAYMENTS",
          x: 10,
          y: 20,
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "column:ANALYTICS.CORE.PAYMENTS.PAYMENT_ID",
              name: "PAYMENT_ID",
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
          ],
          checkConstraints: [
            {
              id: "ck-named-1",
              name: "CK_PAYMENT_AMOUNT",
              expression: "PAYMENT_ID > 0",
              validation: "VALIDATE",
              nameOrigin: "explicit",
            },
            {
              id: "ck-unnamed-1",
              name: null,
              expression: "PAYMENT_ID < 1000000",
              validation: "VALIDATE",
              nameOrigin: "unnamed",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const canonical = diagramToCanonicalProject(initialDiagram);
    const editorRoundtripped = canonicalProjectToDiagram(canonical);

    assert.deepEqual(
      editorRoundtripped.tables[0].checkConstraints,
      initialDiagram.tables[0].checkConstraints,
    );
  });

  it("v2 serialized reopen via openDesktopProject with (a) matching document succeeds", async () => {
    const initialDiagram = {
      database: "snowflake",
      title: "REOPEN_TEST",
      tables: [
        {
          id: "table:ANALYTICS.CORE.ITEMS",
          name: "ITEMS",
          x: 0,
          y: 0,
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "column:ANALYTICS.CORE.ITEMS.ITEM_ID",
              name: "ITEM_ID",
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
          ],
          checkConstraints: [
            {
              id: "ck-item-pos",
              name: "CK_ITEM_POS",
              expression: "ITEM_ID > 0",
              validation: "VALIDATE",
              nameOrigin: "explicit",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const canonical = diagramToCanonicalProject(initialDiagram);
    const serialized = {
      ...canonical,
      drawdb_document: canonicalProjectToDiagram(canonical),
    };

    const opened = await openSerializedProjectForTest(serialized);
    assert.equal(opened.canceled, false);
    assert.deepEqual(
      opened.diagram.tables[0].checkConstraints,
      initialDiagram.tables[0].checkConstraints,
    );
  });

  it("v2 serialized reopen via openDesktopProject with (b) document missing checkConstraints throws CANONICAL_EDITOR_SEMANTIC_MISMATCH", async () => {
    const initialDiagram = {
      database: "snowflake",
      title: "REOPEN_TEST_MISSING",
      tables: [
        {
          id: "table:ANALYTICS.CORE.ITEMS",
          name: "ITEMS",
          x: 0,
          y: 0,
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "column:ANALYTICS.CORE.ITEMS.ITEM_ID",
              name: "ITEM_ID",
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
          ],
          checkConstraints: [
            {
              id: "ck-item-pos",
              name: "CK_ITEM_POS",
              expression: "ITEM_ID > 0",
              validation: "VALIDATE",
              nameOrigin: "explicit",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const canonical = diagramToCanonicalProject(initialDiagram);
    const serialized = {
      ...canonical,
      drawdb_document: canonicalProjectToDiagram(canonical),
    };
    serialized.drawdb_document.tables[0].checkConstraints = [];

    await assert.rejects(
      openSerializedProjectForTest(serialized),
      (err) => {
        assert.equal(err.code, "CANONICAL_EDITOR_SEMANTIC_MISMATCH");
        assert.equal(
          err.message,
          "drawdb_document semantics do not match authoritative physical_model",
        );
        return true;
      },
    );
  });

  it("v2 serialized reopen via openDesktopProject with (c) document with a different expression throws CANONICAL_EDITOR_SEMANTIC_MISMATCH", async () => {
    const initialDiagram = {
      database: "snowflake",
      title: "REOPEN_TEST_DIFF",
      tables: [
        {
          id: "table:ANALYTICS.CORE.ITEMS",
          name: "ITEMS",
          x: 0,
          y: 0,
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "column:ANALYTICS.CORE.ITEMS.ITEM_ID",
              name: "ITEM_ID",
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
          ],
          checkConstraints: [
            {
              id: "ck-item-pos",
              name: "CK_ITEM_POS",
              expression: "ITEM_ID > 0",
              validation: "VALIDATE",
              nameOrigin: "explicit",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };

    const canonical = diagramToCanonicalProject(initialDiagram);
    const serialized = {
      ...canonical,
      drawdb_document: canonicalProjectToDiagram(canonical),
    };
    serialized.drawdb_document.tables[0].checkConstraints[0].expression =
      "ITEM_ID > 999";

    await assert.rejects(
      openSerializedProjectForTest(serialized),
      (err) => {
        assert.equal(err.code, "CANONICAL_EDITOR_SEMANTIC_MISMATCH");
        assert.equal(
          err.message,
          "drawdb_document semantics do not match authoritative physical_model",
        );
        return true;
      },
    );
  });

  it("v1 project with legacy nonblank field.check must throw the LEGACY_FIELD_CHECK error", () => {
    const v1Legacy = {
      database: "snowflake",
      title: "LEGACY_V1",
      tables: [
        {
          id: "t1",
          name: "LEGACY_TABLE",
          x: 0,
          y: 0,
          fields: [
            {
              id: "f1",
              name: "AMOUNT",
              type: "NUMBER",
              size: "12,2",
              default: "",
              check: "AMOUNT >= 0",
              primary: false,
              unique: false,
              notNull: false,
              increment: false,
              comment: "",
            },
          ],
          checkConstraints: [],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    };
    assert.throws(
      () => diagramToCanonicalProject(v1Legacy),
      (err) => {
        assert.equal(err.code, "LEGACY_FIELD_CHECK_UNSUPPORTED");
        assert.equal(
          err.message,
          "Legacy field.check requires explicit migration to table.checkConstraints",
        );
        return true;
      },
    );
  });

  it("DDL parse of all four accepted forms preserves CHECK constraints", () => {
    // 1. table-level named
    const ddl1 =
      "CREATE TABLE ANALYTICS.CORE.T1 (ID NUMBER, CONSTRAINT CK_T1 CHECK (ID > 0));";
    const p1 = parseSnowflakeDDLToCanonicalProject(ddl1);
    assert.deepEqual(p1.physical_model.tables[0].check_constraints, [
      {
        id: "constraint:ANALYTICS.CORE.T1.CK_T1",
        name: "CK_T1",
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
    ]);

    // 2. table-level unnamed
    const ddl2 =
      "CREATE TABLE ANALYTICS.CORE.T2 (ID NUMBER, CHECK (ID > 0));";
    const p2 = parseSnowflakeDDLToCanonicalProject(ddl2);
    assert.deepEqual(p2.physical_model.tables[0].check_constraints, [
      {
        id: "check:ANALYTICS.CORE.T2#1",
        name: null,
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
    ]);

    // 3. column-level (lifted, unnamed)
    const ddl3 =
      "CREATE TABLE ANALYTICS.CORE.T3 (ID NUMBER CHECK (ID > 0));";
    const p3 = parseSnowflakeDDLToCanonicalProject(ddl3);
    assert.deepEqual(p3.physical_model.tables[0].check_constraints, [
      {
        id: "check:ANALYTICS.CORE.T3#1",
        name: null,
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
    ]);

    // 4. ALTER TABLE ADD [CONSTRAINT n] CHECK (both named and unnamed)
    const ddl4 = `
      CREATE TABLE ANALYTICS.CORE.T4 (ID NUMBER);
      ALTER TABLE ANALYTICS.CORE.T4 ADD CONSTRAINT CK_T4 CHECK (ID > 0);
      ALTER TABLE ANALYTICS.CORE.T4 ADD CHECK (ID < 100);
    `;
    const p4 = parseSnowflakeDDLToCanonicalProject(ddl4);
    assert.deepEqual(p4.physical_model.tables[0].check_constraints, [
      {
        id: "check:ANALYTICS.CORE.T4#1",
        name: null,
        expression: "ID < 100",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
      {
        id: "constraint:ANALYTICS.CORE.T4.CK_T4",
        name: "CK_T4",
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "explicit",
      },
    ]);
  });

  it("CREATE TABLE with two unnamed checks yields #1/#2 ids deterministically regardless of whitespace", () => {
    const ddlCompact =
      "CREATE TABLE A.B.T (ID NUMBER, CHECK (ID > 0), CHECK (ID < 100));";
    const ddlWhitespace = `
      CREATE TABLE   A.B.T   (
          ID   NUMBER   ,
          CHECK   (   ID > 0   )   ,
          \t\tCHECK  (
              ID < 100
          )
      );
    `;
    const pCompact = parseSnowflakeDDLToCanonicalProject(ddlCompact);
    const pWhitespace = parseSnowflakeDDLToCanonicalProject(ddlWhitespace);

    const expectedChecks = [
      {
        id: "check:A.B.T#1",
        name: null,
        expression: "ID > 0",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
      {
        id: "check:A.B.T#2",
        name: null,
        expression: "ID < 100",
        validation: "VALIDATE",
        name_origin: "unnamed",
      },
    ];

    assert.deepEqual(pCompact.physical_model.tables[0].check_constraints, expectedChecks);
    assert.deepEqual(pWhitespace.physical_model.tables[0].check_constraints, expectedChecks);
  });
});

describe("Snowflake independent snapshot", () => {
  it("preserves exact canonical v2 literal through canonicalProjectToDiagram -> diagramToCanonicalProject and DDL render -> parse", () => {
    const literal = {
      project_version: "1",
      physical_model: {
        model_version: "2",
        name: "independent-snapshot-model",
        namespaces: [
          {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
        ],
        tables: [
          {
            id: "table:ANALYTICS.CORE.CHILD",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "CHILD",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.CHILD.CHILD_ID",
                name: "CHILD_ID",
                ordinal: 1,
                data_type: {
                  family: "NUMBER",
                  text: "NUMBER(38, 0)",
                  precision: 38,
                  scale: 0,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.PARENT_ID",
                name: "PARENT_ID",
                ordinal: 2,
                data_type: {
                  family: "NUMBER",
                  text: "NUMBER(38, 0)",
                  precision: 38,
                  scale: 0,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.IS_VALID",
                name: "IS_VALID",
                ordinal: 3,
                data_type: {
                  family: "BOOLEAN",
                  text: "BOOLEAN",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.BIN_DATA",
                name: "BIN_DATA",
                ordinal: 4,
                data_type: {
                  family: "BINARY",
                  text: "BINARY(8388608)",
                  precision: null,
                  scale: null,
                  length: 8388608,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.VAR_PAYLOAD",
                name: "VAR_PAYLOAD",
                ordinal: 5,
                data_type: {
                  family: "VARIANT",
                  text: "VARIANT",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.OBJ_PAYLOAD",
                name: "OBJ_PAYLOAD",
                ordinal: 6,
                data_type: {
                  family: "OBJECT",
                  text: "OBJECT",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.ARR_PAYLOAD",
                name: "ARR_PAYLOAD",
                ordinal: 7,
                data_type: {
                  family: "ARRAY",
                  text: "ARRAY",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.GEO_LOC",
                name: "GEO_LOC",
                ordinal: 8,
                data_type: {
                  family: "GEOGRAPHY",
                  text: "GEOGRAPHY",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.GEOM_SHAPE",
                name: "GEOM_SHAPE",
                ordinal: 9,
                data_type: {
                  family: "GEOMETRY",
                  text: "GEOMETRY",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.CHILD.EMBEDDING",
                name: "EMBEDDING",
                ordinal: 10,
                data_type: {
                  family: "VECTOR",
                  text: "VECTOR(FLOAT, 1536)",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: "FLOAT",
                  vector_dimension: 1536,
                },
                nullable: true,
                default: null,
                comment: null,
              },
            ],
            constraints: [
              {
                id: "constraint:ANALYTICS.CORE.CHILD.FK_CHILD_PARENT",
                name: "FK_CHILD_PARENT",
                kind: "foreign_key",
                columns: ["column:ANALYTICS.CORE.CHILD.PARENT_ID"],
                referenced_table_id: "table:ANALYTICS.CORE.PARENT",
                referenced_columns: ["column:ANALYTICS.CORE.PARENT.ID"],
              },
              {
                id: "constraint:ANALYTICS.CORE.CHILD.PK_CHILD",
                name: "PK_CHILD",
                kind: "primary_key",
                columns: ["column:ANALYTICS.CORE.CHILD.CHILD_ID"],
                referenced_table_id: null,
                referenced_columns: [],
              },
            ],
            check_constraints: [
              {
                id: "check:ANALYTICS.CORE.CHILD#1",
                name: null,
                expression: "CHILD_ID > 0",
                validation: "VALIDATE",
                name_origin: "unnamed",
              },
            ],
            comment: null,
          },
          {
            id: "table:ANALYTICS.CORE.PARENT",
            namespace_id: "namespace:ANALYTICS.CORE",
            name: "PARENT",
            kind: "table",
            columns: [
              {
                id: "column:ANALYTICS.CORE.PARENT.ID",
                name: "ID",
                ordinal: 1,
                data_type: {
                  family: "NUMBER",
                  text: "NUMBER(38, 0)",
                  precision: 38,
                  scale: 0,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.CODE",
                name: "CODE",
                ordinal: 2,
                data_type: {
                  family: "VARCHAR",
                  text: "VARCHAR(50)",
                  precision: null,
                  scale: null,
                  length: 50,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: false,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.SCORE",
                name: "SCORE",
                ordinal: 3,
                data_type: {
                  family: "FLOAT",
                  text: "FLOAT",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.CREATED_DATE",
                name: "CREATED_DATE",
                ordinal: 4,
                data_type: {
                  family: "DATE",
                  text: "DATE",
                  precision: null,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.CREATED_TIME",
                name: "CREATED_TIME",
                ordinal: 5,
                data_type: {
                  family: "TIME",
                  text: "TIME(9)",
                  precision: 9,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.TS_NTZ",
                name: "TS_NTZ",
                ordinal: 6,
                data_type: {
                  family: "TIMESTAMP_NTZ",
                  text: "TIMESTAMP_NTZ(9)",
                  precision: 9,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.TS_LTZ",
                name: "TS_LTZ",
                ordinal: 7,
                data_type: {
                  family: "TIMESTAMP_LTZ",
                  text: "TIMESTAMP_LTZ(9)",
                  precision: 9,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
              {
                id: "column:ANALYTICS.CORE.PARENT.TS_TZ",
                name: "TS_TZ",
                ordinal: 8,
                data_type: {
                  family: "TIMESTAMP_TZ",
                  text: "TIMESTAMP_TZ(9)",
                  precision: 9,
                  scale: null,
                  length: null,
                  vector_element_type: null,
                  vector_dimension: null,
                },
                nullable: true,
                default: null,
                comment: null,
              },
            ],
            constraints: [
              {
                id: "constraint:ANALYTICS.CORE.PARENT.PK_PARENT",
                name: "PK_PARENT",
                kind: "primary_key",
                columns: ["column:ANALYTICS.CORE.PARENT.ID"],
                referenced_table_id: null,
                referenced_columns: [],
              },
              {
                id: "constraint:ANALYTICS.CORE.PARENT.UQ_PARENT_CODE",
                name: "UQ_PARENT_CODE",
                kind: "unique",
                columns: ["column:ANALYTICS.CORE.PARENT.CODE"],
                referenced_table_id: null,
                referenced_columns: [],
              },
            ],
            check_constraints: [
              {
                id: "check:ANALYTICS.CORE.PARENT#1",
                name: null,
                expression: "ID > 0",
                validation: "VALIDATE",
                name_origin: "unnamed",
              },
              {
                id: "constraint:ANALYTICS.CORE.PARENT.CK_PARENT_CODE",
                name: "CK_PARENT_CODE",
                expression: "LENGTH(CODE) >= 2",
                validation: "VALIDATE",
                name_origin: "explicit",
              },
            ],
            comment: null,
          },
        ],
        relationships: [
          {
            id: "relationship:ANALYTICS.CORE.CHILD.FK_CHILD_PARENT",
            name: "FK_CHILD_PARENT",
            source_table_id: "table:ANALYTICS.CORE.CHILD",
            source_column_ids: ["column:ANALYTICS.CORE.CHILD.PARENT_ID"],
            target_table_id: "table:ANALYTICS.CORE.PARENT",
            target_column_ids: ["column:ANALYTICS.CORE.PARENT.ID"],
            cardinality: "many_to_one",
          },
        ],
      },
      diagram_layout: {
        nodes: {
          "table:ANALYTICS.CORE.CHILD": { x: 0, y: 80 },
          "table:ANALYTICS.CORE.PARENT": { x: 280, y: 80 },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const diagram = canonicalProjectToDiagram(literal);
    const roundtripped = diagramToCanonicalProject(diagram);
    assert.deepEqual(roundtripped, literal);

    const ddl = renderCanonicalSnowflakeDDL(literal);
    const parsed = parseSnowflakeDDLToCanonicalProject(ddl, {
      name: literal.physical_model.name,
    });
    assertSemanticEqual(assert, parsed, literal);
  });
});

