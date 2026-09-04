import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DB } from "../src/data/constants.js";
import { exportSQL } from "../src/utils/exportSQL/index.js";
import { importSQL } from "../src/utils/importSQL/index.js";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
} from "../src/erdTool/projectAdapter.js";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const terraformRoundTripPath = path.join(
  repositoryRoot,
  "src",
  "erdTool",
  "terraformRoundTrip.js",
);
const controlPanelPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "ControlPanel.jsx",
);
const importModalPath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "Modal.jsx",
);
const importSourcePath = path.join(
  repositoryRoot,
  "src",
  "components",
  "EditorHeader",
  "Modal",
  "ImportSource.jsx",
);
const desktopBridgePath = path.join(
  repositoryRoot,
  "src",
  "erdTool",
  "desktopBridge.js",
);
const electronMainPath = path.join(
  repositoryRoot,
  "src",
  "electron",
  "main.ts",
);

async function loadTerraformRoundTrip() {
  const module = await import("../src/erdTool/terraformRoundTrip.js");
  for (const exportName of [
    "terraformHclToCanonicalProject",
    "terraformHclToDiagram",
    "canonicalProjectToTerraformHcl",
  ]) {
    assert.equal(
      typeof module[exportName],
      "function",
      `src/erdTool/terraformRoundTrip.js must export ${exportName}()`,
    );
  }
  return module;
}

const supportedTerraformModule = `
terraform {
  required_providers {
    snowflake = {
      source  = "snowflakedb/snowflake"
      version = "~> 2.18"
    }
  }
}

resource "snowflake_database" "analytics" {
  name = "ANALYTICS"
}

resource "snowflake_schema" "core" {
  database = snowflake_database.analytics.name
  name     = "CORE"
}

resource "snowflake_schema" "mart" {
  database = snowflake_database.analytics.name
  name     = "MART"
}

resource "snowflake_table" "customer" {
  database = snowflake_schema.core.database
  schema   = snowflake_schema.core.name
  name     = "CUSTOMER"
  comment  = "Customer dimension"

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
    comment  = "surrogate key"
  }

  column {
    name     = "EMAIL"
    type     = "VARCHAR(320)"
    nullable = false
    comment  = "natural key"
  }

  column {
    name     = "ACTIVE"
    type     = "BOOLEAN"
    nullable = false

    default {
      constant = "TRUE"
    }
  }

  column {
    name     = "CREATED_AT"
    type     = "TIMESTAMP_NTZ(9)"
    nullable = false

    default {
      expression = "CURRENT_TIMESTAMP()"
    }
  }
}

resource "snowflake_table" "order_header" {
  database = snowflake_schema.mart.database
  schema   = snowflake_schema.mart.name
  name     = "ORDER_HEADER"
  comment  = "Order facts"

  column {
    name     = "ORDER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "ORDER_DATE"
    type     = "DATE"
    nullable = false
  }

  column {
    name     = "ORDER_AMOUNT"
    type     = "NUMBER(12, 2)"
    nullable = false

    default {
      constant = "0"
    }
  }
}

resource "snowflake_table_constraint" "pk_customer" {
  name     = "PK_CUSTOMER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.customer.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false
}

resource "snowflake_table_constraint" "uq_customer_email" {
  name     = "UQ_CUSTOMER_EMAIL"
  type     = "UNIQUE"
  table_id = snowflake_table.customer.fully_qualified_name
  columns  = ["EMAIL"]
  enforced = false
}

resource "snowflake_table_constraint" "pk_order_header" {
  name     = "PK_ORDER_HEADER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.order_header.fully_qualified_name
  columns  = ["ORDER_ID"]
  enforced = false
}

resource "snowflake_table_constraint" "fk_order_header_customer" {
  name     = "FK_ORDER_HEADER_CUSTOMER"
  type     = "FOREIGN KEY"
  table_id = snowflake_table.order_header.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false

  foreign_key_properties {
    references {
      table_id = snowflake_table.customer.fully_qualified_name
      columns  = ["CUSTOMER_ID"]
    }
  }
}
`;

const expectedTerraformHcl = `terraform {
  required_providers {
    snowflake = {
      source  = "snowflakedb/snowflake"
      version = ">= 2.0.0"
    }
  }
}

resource "snowflake_database" "analytics" {
  name = "ANALYTICS"
}

resource "snowflake_schema" "analytics_core" {
  database = snowflake_database.analytics.name
  name     = "CORE"
}

resource "snowflake_schema" "analytics_mart" {
  database = snowflake_database.analytics.name
  name     = "MART"
}

resource "snowflake_table" "analytics_core_customer" {
  database = snowflake_schema.analytics_core.database
  schema   = snowflake_schema.analytics_core.name
  name     = "CUSTOMER"
  comment  = "Customer dimension"

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
    comment  = "surrogate key"
  }

  column {
    name     = "EMAIL"
    type     = "VARCHAR(320)"
    nullable = false
    comment  = "natural key"
  }

  column {
    name     = "ACTIVE"
    type     = "BOOLEAN"
    nullable = false

    default {
      constant = "TRUE"
    }
  }

  column {
    name     = "CREATED_AT"
    type     = "TIMESTAMP_NTZ(9)"
    nullable = false

    default {
      expression = "CURRENT_TIMESTAMP()"
    }
  }
}

resource "snowflake_table" "analytics_mart_order_header" {
  database = snowflake_schema.analytics_mart.database
  schema   = snowflake_schema.analytics_mart.name
  name     = "ORDER_HEADER"
  comment  = "Order facts"

  column {
    name     = "ORDER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "CUSTOMER_ID"
    type     = "NUMBER(38, 0)"
    nullable = false
  }

  column {
    name     = "ORDER_DATE"
    type     = "DATE"
    nullable = false
  }

  column {
    name     = "ORDER_AMOUNT"
    type     = "NUMBER(12, 2)"
    nullable = false

    default {
      constant = "0"
    }
  }
}

resource "snowflake_table_constraint" "analytics_core_customer_pk_customer" {
  name     = "PK_CUSTOMER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.analytics_core_customer.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false
}

resource "snowflake_table_constraint" "analytics_core_customer_uq_customer_email" {
  name     = "UQ_CUSTOMER_EMAIL"
  type     = "UNIQUE"
  table_id = snowflake_table.analytics_core_customer.fully_qualified_name
  columns  = ["EMAIL"]
  enforced = false
}

resource "snowflake_table_constraint" "analytics_mart_order_header_fk_order_header_customer" {
  name     = "FK_ORDER_HEADER_CUSTOMER"
  type     = "FOREIGN KEY"
  table_id = snowflake_table.analytics_mart_order_header.fully_qualified_name
  columns  = ["CUSTOMER_ID"]
  enforced = false

  foreign_key_properties {
    references {
      table_id = snowflake_table.analytics_core_customer.fully_qualified_name
      columns  = ["CUSTOMER_ID"]
    }
  }
}

resource "snowflake_table_constraint" "analytics_mart_order_header_pk_order_header" {
  name     = "PK_ORDER_HEADER"
  type     = "PRIMARY KEY"
  table_id = snowflake_table.analytics_mart_order_header.fully_qualified_name
  columns  = ["ORDER_ID"]
  enforced = false
}
`;

function type(
  family,
  text,
  precision = null,
  scale = null,
  length = null,
  element_type = null,
  dimension = null,
) {
  return {
    family,
    text,
    precision,
    scale,
    length,
    element_type,
    dimension,
  };
}

function modelColumn(
  catalog,
  schema,
  table,
  name,
  ordinal,
  dataType,
  nullable,
  defaultValue = null,
  comment = null,
) {
  return {
    id: `column:${catalog}.${schema}.${table}.${name}`,
    name,
    ordinal,
    data_type: dataType,
    nullable,
    default: defaultValue,
    comment,
  };
}

function modelConstraint(catalog, schema, table, name, kind, columnNames) {
  return {
    id: `constraint:${catalog}.${schema}.${table}.${name}`,
    name,
    kind,
    columns: columnNames.map(
      (columnName) => `column:${catalog}.${schema}.${table}.${columnName}`,
    ),
    referenced_table_id: null,
    referenced_columns: [],
    expression: null,
  };
}

function supportedCanonicalProject() {
  return {
    project_version: "2",
    physical_model: {
      model_version: "2",
      name: "terraform-retail",
      namespaces: [
        { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
        { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
      ],
      tables: [
        {
          id: "table:ANALYTICS.CORE.CUSTOMER",
          namespace_id: "namespace:ANALYTICS.CORE",
          name: "CUSTOMER",
          kind: "table",
          columns: [
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "CUSTOMER_ID",
              1,
              type("NUMBER", "NUMBER(38, 0)", 38, 0),
              false,
              null,
              "surrogate key",
            ),
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "EMAIL",
              2,
              type("VARCHAR", "VARCHAR(320)", null, null, 320),
              false,
              null,
              "natural key",
            ),
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "ACTIVE",
              3,
              type("BOOLEAN", "BOOLEAN"),
              false,
              "TRUE",
            ),
            modelColumn(
              "ANALYTICS",
              "CORE",
              "CUSTOMER",
              "CREATED_AT",
              4,
              type("TIMESTAMP_NTZ", "TIMESTAMP_NTZ(9)", 9),
              false,
              "CURRENT_TIMESTAMP()",
            ),
          ],
          constraints: [
            modelConstraint("ANALYTICS", "CORE", "CUSTOMER", "PK_CUSTOMER", "primary_key", [
              "CUSTOMER_ID",
            ]),
            modelConstraint("ANALYTICS", "CORE", "CUSTOMER", "UQ_CUSTOMER_EMAIL", "unique", [
              "EMAIL",
            ]),
          ],
          comment: "Customer dimension",
        },
        {
          id: "table:ANALYTICS.MART.ORDER_HEADER",
          namespace_id: "namespace:ANALYTICS.MART",
          name: "ORDER_HEADER",
          kind: "table",
          columns: [
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "ORDER_ID",
              1,
              type("NUMBER", "NUMBER(38, 0)", 38, 0),
              false,
            ),
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "CUSTOMER_ID",
              2,
              type("NUMBER", "NUMBER(38, 0)", 38, 0),
              false,
            ),
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "ORDER_DATE",
              3,
              type("DATE", "DATE"),
              false,
            ),
            modelColumn(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "ORDER_AMOUNT",
              4,
              type("NUMBER", "NUMBER(12, 2)", 12, 2),
              false,
              "0",
            ),
          ],
          constraints: [
            {
              ...modelConstraint(
                "ANALYTICS",
                "MART",
                "ORDER_HEADER",
                "FK_ORDER_HEADER_CUSTOMER",
                "foreign_key",
                ["CUSTOMER_ID"],
              ),
              referenced_table_id: "table:ANALYTICS.CORE.CUSTOMER",
              referenced_columns: [
                "column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID",
              ],
            },
            modelConstraint(
              "ANALYTICS",
              "MART",
              "ORDER_HEADER",
              "PK_ORDER_HEADER",
              "primary_key",
              ["ORDER_ID"],
            ),
          ],
          comment: "Order facts",
        },
      ],
      relationships: [
        {
          id: "relationship:ANALYTICS.MART.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
          name: "FK_ORDER_HEADER_CUSTOMER",
          source_table_id: "table:ANALYTICS.MART.ORDER_HEADER",
          source_column_ids: [
            "column:ANALYTICS.MART.ORDER_HEADER.CUSTOMER_ID",
          ],
          target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
          target_column_ids: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
          cardinality: "many_to_one",
        },
      ],
    },
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.CUSTOMER": { x: 0, y: 80 },
        "table:ANALYTICS.MART.ORDER_HEADER": { x: 280, y: 80 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function moduleFiles() {
  const firstTable = supportedTerraformModule.indexOf(
    'resource "snowflake_table" "customer"',
  );
  const firstConstraint = supportedTerraformModule.indexOf(
    'resource "snowflake_table_constraint"',
  );
  assert.ok(firstTable > 0);
  assert.ok(firstConstraint > firstTable);

  return [
    {
      path: "01-namespaces.tf",
      contents: supportedTerraformModule.slice(0, firstTable),
    },
    {
      path: "02-tables.tf",
      contents: supportedTerraformModule.slice(firstTable, firstConstraint),
    },
    {
      path: "03-constraints.tf",
      contents: supportedTerraformModule.slice(firstConstraint),
    },
  ];
}

function semanticTypeModule(rows) {
  const columns = rows
    .map(
      ([name, typeExpression]) => `
  column {
    name = "${name}"
    type = "${typeExpression}"
  }
`,
    )
    .join("");
  return `
resource "snowflake_table" "semantic_types" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "SEMANTIC_TYPES"
${columns}}
`;
}

const semanticTypeRows = [
  ["NUMBER_DEFAULT", "NUMBER"],
  ["DECIMAL_ONE_ARG", "DECIMAL(12)"],
  ["NUMERIC_TWO_ARGS", "NUMERIC(12, 2)"],
  ["INTEGER_ALIAS", "INTEGER"],
  ["FLOAT_ALIAS", "DOUBLE PRECISION"],
  ["VARCHAR_DEFAULT", "TEXT"],
  ["CHAR_DEFAULT", "CHAR"],
  ["VARCHAR_MAX", "NVARCHAR(134217728)"],
  ["BINARY_DEFAULT", "VARBINARY"],
  ["BINARY_MAX", "BINARY(67108864)"],
  ["DATE_TYPE", "DATE"],
  ["TIME_DEFAULT", "TIME"],
  ["TIME_ZERO", "TIME(0)"],
  ["NTZ_ALIAS", "DATETIME(3)"],
  ["LTZ_ALIAS", "TIMESTAMPLTZ(4)"],
  ["TZ_ALIAS", "TIMESTAMP WITH TIME ZONE(5)"],
  ["VARIANT_TYPE", "VARIANT"],
  ["OBJECT_TYPE", "OBJECT"],
  ["ARRAY_TYPE", "ARRAY"],
  ["GEOGRAPHY_TYPE", "GEOGRAPHY"],
  ["GEOMETRY_TYPE", "GEOMETRY"],
  ["VECTOR_INT", "VECTOR(INT, 1)"],
  ["VECTOR_FLOAT_MAX", "VECTOR(FLOAT, 4096)"],
];

function terraformStateFixture() {
  return JSON.stringify(
    {
      version: 4,
      terraform_version: "1.9.0",
      serial: 7,
      lineage: "state-must-not-import",
      outputs: {
        password: { value: "[REDACTED_STATE_OUTPUT]", sensitive: true },
      },
      resources: [
        {
          mode: "managed",
          type: "snowflake_table",
          name: "customer",
          instances: [
            {
              attributes: {
                id: "ANALYTICS|CORE|CUSTOMER",
                database: "ANALYTICS",
                schema: "CORE",
                name: "CUSTOMER",
              },
            },
          ],
        },
      ],
    },
    null,
    2,
  );
}

function credentialBearingProviderFixture() {
  return `
provider "snowflake" {
  account_name = "[REDACTED_ACCOUNT]"
  user         = "[REDACTED_USER]"
  password     = "[REDACTED_PASSWORD]"
  token        = "[REDACTED_TOKEN]"
  private_key  = "[REDACTED_PRIVATE_KEY]"
}

resource "snowflake_database" "analytics" {
  name = "ANALYTICS"
}
`;
}

function assertNoSecretMaterial(value) {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  for (const forbidden of [
    "[REDACTED_PASSWORD]",
    "[REDACTED_TOKEN]",
    "[REDACTED_PRIVATE_KEY]",
    "[REDACTED_STATE_OUTPUT]",
    "[REDACTED_ACCOUNT]",
    "[REDACTED_USER]",
  ]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(
    serialized,
    /"(?:password|private_key|token|backend|tfstate)"\s*:/i,
  );
}

function terraformSemanticSnapshot(project) {
  const model = project.physical_model;
  return {
    namespaces: model.namespaces.map((namespace) => ({
      id: namespace.id,
      catalog: namespace.catalog,
      schema: namespace.schema,
    })),
    tables: model.tables.map((table) => ({
      id: table.id,
      namespace_id: table.namespace_id,
      name: table.name,
      kind: table.kind,
      comment: table.comment,
      columns: table.columns.map((column) => ({
        id: column.id,
        name: column.name,
        ordinal: column.ordinal,
        data_type: column.data_type,
        nullable: column.nullable,
        default: column.default,
        comment: column.comment,
      })),
      constraints: table.constraints.map((constraint) => ({
        id: constraint.id,
        name: constraint.name,
        kind: constraint.kind,
        columns: constraint.columns,
        referenced_table_id: constraint.referenced_table_id,
        referenced_columns: constraint.referenced_columns,
      })),
    })),
    relationships: model.relationships.map((relationship) => ({
      id: relationship.id,
      name: relationship.name,
      source_table_id: relationship.source_table_id,
      source_column_ids: relationship.source_column_ids,
      target_table_id: relationship.target_table_id,
      target_column_ids: relationship.target_column_ids,
      cardinality: relationship.cardinality,
    })),
  };
}

function assertSupportedTerraformSemantics(project) {
  const snapshot = terraformSemanticSnapshot(project);
  assert.deepEqual(snapshot.namespaces, [
    { id: "namespace:ANALYTICS.CORE", catalog: "ANALYTICS", schema: "CORE" },
    { id: "namespace:ANALYTICS.MART", catalog: "ANALYTICS", schema: "MART" },
  ]);
  assert.deepEqual(
    snapshot.tables.map((table) => ({
      id: table.id,
      namespace_id: table.namespace_id,
      name: table.name,
      columnNames: table.columns.map((column) => column.name),
      constraintKinds: table.constraints.map((constraint) => constraint.kind),
    })),
    [
      {
        id: "table:ANALYTICS.CORE.CUSTOMER",
        namespace_id: "namespace:ANALYTICS.CORE",
        name: "CUSTOMER",
        columnNames: ["CUSTOMER_ID", "EMAIL", "ACTIVE", "CREATED_AT"],
        constraintKinds: ["primary_key", "unique"],
      },
      {
        id: "table:ANALYTICS.MART.ORDER_HEADER",
        namespace_id: "namespace:ANALYTICS.MART",
        name: "ORDER_HEADER",
        columnNames: ["ORDER_ID", "CUSTOMER_ID", "ORDER_DATE", "ORDER_AMOUNT"],
        constraintKinds: ["foreign_key", "primary_key"],
      },
    ],
  );
  assert.deepEqual(snapshot.relationships, [
    {
      id: "relationship:ANALYTICS.MART.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER",
      name: "FK_ORDER_HEADER_CUSTOMER",
      source_table_id: "table:ANALYTICS.MART.ORDER_HEADER",
      source_column_ids: ["column:ANALYTICS.MART.ORDER_HEADER.CUSTOMER_ID"],
      target_table_id: "table:ANALYTICS.CORE.CUSTOMER",
      target_column_ids: ["column:ANALYTICS.CORE.CUSTOMER.CUSTOMER_ID"],
      cardinality: "many_to_one",
    },
  ]);
}

function reorderedCanonicalProject() {
  const project = supportedCanonicalProject();
  project.physical_model.namespaces.reverse();
  project.physical_model.tables.reverse();
  for (const table of project.physical_model.tables) {
    table.constraints.reverse();
  }
  project.diagram_layout.nodes = {
    "table:ANALYTICS.MART.ORDER_HEADER": { x: 999, y: 999 },
    "table:ANALYTICS.CORE.CUSTOMER": { x: -100, y: -100 },
  };
  return project;
}

function sqliteRegressionFixture() {
  return {
    database: DB.SQLITE,
    tables: [
      {
        id: "users",
        name: "users",
        comment: "",
        fields: [{ id: "user-id", name: "id", type: "INTEGER", primary: true }],
        indices: [],
        uniqueConstraints: [],
      },
    ],
    references: [],
  };
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

describe("SS-015 Terraform round-trip engineering", () => {
  it("rejects CHECK-bearing canonical and embedded legacy inputs with a typed error", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const project = supportedCanonicalProject();
    const table = project.physical_model.tables[0];
    table.constraints.push({
      id: `${table.id.replace("table:", "constraint:")}.CK_TEST`,
      name: "CK_TEST",
      kind: "check",
      expression: "CUSTOMER_ID > 0",
      columns: [],
      referenced_columns: [],
      referenced_table_id: null,
    });
    for (const value of [project, project.physical_model]) {
      const before = structuredClone(value);
      assert.throws(() => canonicalProjectToTerraformHcl(value), {
        name: "SnowflakeCheckError",
        code: "SNOWFLAKE_CHECK_UNSUPPORTED",
      });
      assert.deepEqual(value, before);
    }
    for (const legacy of [false, true]) {
      const embedded = supportedCanonicalProject();
      embedded.drawdb_document = {
        tables: [
          {
            name: "T",
            fields: legacy ? [{ name: "C", check: "C > 0" }] : [],
            ...(legacy
              ? {}
              : {
                  checkConstraints: [
                    { id: "ck", name: "CK_T", expression: "C > 0" },
                  ],
                }),
          },
        ],
      };
      assert.throws(() => canonicalProjectToTerraformHcl(embedded), {
        name: "SnowflakeCheckError",
        code: "SNOWFLAKE_CHECK_UNSUPPORTED",
      });
    }
  });

  it("rejects Terraform CHECK forms before returning a partial model", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();
    for (const hcl of [
      'resource "snowflake_table_constraint" "c" { type = "CHECK" expression = "C > 0" }',
      'resource "snowflake_check_constraint" "c" { expression = "C > 0" }',
      'resource "snowflake_table" "t" { check { expression = "C > 0" } }',
      'resource "snowflake_table" "t" { check_clause = "C > 0" }',
    ]) {
      assert.throws(() => terraformHclToCanonicalProject(hcl), {
        name: "SnowflakeCheckError",
        code: "SNOWFLAKE_CHECK_UNSUPPORTED",
      });
    }
  });
  it("imports deterministic Snowflake Terraform HCL into the canonical physical model", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();

    const project = terraformHclToCanonicalProject(supportedTerraformModule, {
      name: "terraform-retail",
    });

    assert.deepEqual(project, supportedCanonicalProject());
    assertSupportedTerraformSemantics(project);
    assert.deepEqual(
      terraformHclToCanonicalProject(supportedTerraformModule, {
        name: "terraform-retail",
      }),
      project,
    );
    assertNoSecretMaterial(project);
  });

  it("imports a multi-file Terraform module representation with the same semantics as a single HCL file", async () => {
    const { terraformHclToCanonicalProject, terraformHclToDiagram } =
      await loadTerraformRoundTrip();

    const fromFiles = terraformHclToCanonicalProject(moduleFiles(), {
      name: "terraform-retail",
    });
    const diagram = terraformHclToDiagram(moduleFiles(), {
      title: "terraform-retail",
    });

    assert.deepEqual(fromFiles, supportedCanonicalProject());
    assertSupportedTerraformSemantics(fromFiles);
    assert.equal(diagram.database, DB.SNOWFLAKE);
    assert.equal(diagram.title, "terraform-retail");
    assert.deepEqual(
      diagram.tables.map((table) => table.id),
      [
        "table:ANALYTICS.CORE.CUSTOMER",
        "table:ANALYTICS.MART.ORDER_HEADER",
      ],
    );
    assert.deepEqual(
      diagram.relationships.map((relationship) => relationship.id),
      ["relationship:ANALYTICS.MART.ORDER_HEADER.FK_ORDER_HEADER_CUSTOMER"],
    );
    assert.equal(
      diagram.tables[0].fields.find((field) => field.name === "EMAIL").unique,
      true,
    );
    assert.equal(
      diagram.tables[1].fields.find((field) => field.name === "CUSTOMER_ID")
        .notNull,
      true,
    );
    assertNoSecretMaterial(diagram);
  });

  it("exports a canonical physical model to deterministic Terraform HCL through validation", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const project = supportedCanonicalProject();
    const commandCalls = [];

    const hcl = canonicalProjectToTerraformHcl(project, {
      commandRunner(...args) {
        commandCalls.push(args);
        throw new Error("Terraform CLI must not be invoked by export");
      },
    });

    assert.equal(hcl, expectedTerraformHcl);
    assert.equal(canonicalProjectToTerraformHcl(structuredClone(project)), hcl);
    assert.equal(canonicalProjectToTerraformHcl(reorderedCanonicalProject()), hcl);
    assert.deepEqual(commandCalls, []);
    assert.doesNotMatch(hcl, /diagram_layout|viewport|x\s*=|y\s*=/i);
    assertNoSecretMaterial(hcl);

    const invalid = structuredClone(project);
    invalid.physical_model.tables[0].columns[0].data_type = {
      family: "XML",
      text: "XML",
      precision: null,
      scale: null,
      length: null,
      element_type: null,
      dimension: null,
    };
    assert.throws(
      () => canonicalProjectToTerraformHcl(invalid),
      /unsupported type family XML/i,
    );
  });

  it("round-trips supported Terraform semantics without changing canonical meaning", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();

    const imported = terraformHclToCanonicalProject(supportedTerraformModule, {
      name: "terraform-retail",
    });
    const rendered = canonicalProjectToTerraformHcl(imported);
    const importedAgain = terraformHclToCanonicalProject(rendered, {
      name: "terraform-retail",
    });
    const diagram = canonicalProjectToDiagram(importedAgain);
    const savedAgain = diagramToCanonicalProject(diagram);

    assert.equal(rendered, expectedTerraformHcl);
    assertSupportedTerraformSemantics(imported);
    assertSupportedTerraformSemantics(importedAgain);
    assert.deepEqual(
      terraformSemanticSnapshot(importedAgain),
      terraformSemanticSnapshot(imported),
    );
    assert.deepEqual(importedAgain.physical_model, imported.physical_model);
    const expectedSavedModel = structuredClone(imported.physical_model);
    expectedSavedModel.model_version = "2";
    for (const table of expectedSavedModel.tables) {
      for (const column of table.columns) {
        column.data_type.element_type = null;
        column.data_type.dimension = null;
      }
    }
    assert.deepEqual(savedAgain.physical_model, expectedSavedModel);
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);
    assertNoSecretMaterial(importedAgain);
    assertNoSecretMaterial(savedAgain);
  });

  it("preserves the complete shared Snowflake type contract through Terraform", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();
    const imported = terraformHclToCanonicalProject(
      semanticTypeModule(semanticTypeRows),
    );
    const columns = imported.physical_model.tables[0].columns;

    assert.equal(imported.project_version, "2");
    assert.equal(imported.physical_model.model_version, "2");
    assert.deepEqual(
      columns.map(({ data_type }) => data_type),
      [
        type("NUMBER", "NUMBER(38, 0)", 38, 0),
        type("NUMBER", "NUMBER(12, 0)", 12, 0),
        type("NUMBER", "NUMBER(12, 2)", 12, 2),
        type("NUMBER", "NUMBER(38, 0)", 38, 0),
        type("FLOAT", "FLOAT"),
        type("VARCHAR", "VARCHAR(16777216)", null, null, 16777216),
        type("VARCHAR", "VARCHAR(1)", null, null, 1),
        type("VARCHAR", "VARCHAR(134217728)", null, null, 134217728),
        type("BINARY", "BINARY(8388608)", null, null, 8388608),
        type("BINARY", "BINARY(67108864)", null, null, 67108864),
        type("DATE", "DATE"),
        type("TIME", "TIME(9)", 9),
        type("TIME", "TIME(0)", 0),
        type("TIMESTAMP_NTZ", "TIMESTAMP_NTZ(3)", 3),
        type("TIMESTAMP_LTZ", "TIMESTAMP_LTZ(4)", 4),
        type("TIMESTAMP_TZ", "TIMESTAMP_TZ(5)", 5),
        type("VARIANT", "VARIANT"),
        type("OBJECT", "OBJECT"),
        type("ARRAY", "ARRAY"),
        type("GEOGRAPHY", "GEOGRAPHY"),
        type("GEOMETRY", "GEOMETRY"),
        type("VECTOR", "VECTOR(INT, 1)", null, null, null, "INT", 1),
        type(
          "VECTOR",
          "VECTOR(FLOAT, 4096)",
          null,
          null,
          null,
          "FLOAT",
          4096,
        ),
      ],
    );

    const rendered = canonicalProjectToTerraformHcl(imported);
    assert.match(rendered, /type\s*=\s*"NUMBER\(38, 0\)"/);
    assert.match(rendered, /type\s*=\s*"VARCHAR\(16777216\)"/);
    assert.match(rendered, /type\s*=\s*"TIMESTAMP_LTZ\(4\)"/);
    assert.match(rendered, /type\s*=\s*"VECTOR\(INT, 1\)"/);
    assert.match(rendered, /type\s*=\s*"VECTOR\(FLOAT, 4096\)"/);

    const importedAgain = terraformHclToCanonicalProject(rendered);
    assert.deepEqual(
      terraformSemanticSnapshot(importedAgain),
      terraformSemanticSnapshot(imported),
    );
  });

  it("accepts every approved alias through the Terraform boundary", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();
    const aliases = [
      ["NUMBER", "NUMBER(38, 0)"],
      ["DECIMAL(12, 2)", "NUMBER(12, 2)"],
      ["DEC(12)", "NUMBER(12, 0)"],
      ["NUMERIC", "NUMBER(38, 0)"],
      ...["INT", "INTEGER", "BIGINT", "SMALLINT", "TINYINT", "BYTEINT"].map(
        (alias) => [alias, "NUMBER(38, 0)"],
      ),
      ...["FLOAT", "FLOAT4", "FLOAT8", "DOUBLE", "DOUBLE PRECISION", "REAL"].map(
        (alias) => [alias, "FLOAT"],
      ),
      ["BOOLEAN", "BOOLEAN"],
      ...[
        "VARCHAR",
        "STRING",
        "TEXT",
        "VARCHAR2",
        "NVARCHAR",
        "NVARCHAR2",
        "CHAR VARYING",
        "NCHAR VARYING",
      ].map((alias) => [alias, "VARCHAR(16777216)"]),
      ...["CHAR", "CHARACTER", "NCHAR"].map((alias) => [alias, "VARCHAR(1)"]),
      ["BINARY", "BINARY(8388608)"],
      ["VARBINARY", "BINARY(8388608)"],
      ["DATE", "DATE"],
      ["TIME", "TIME(9)"],
      ...[
        "TIMESTAMP_NTZ",
        "TIMESTAMPNTZ",
        "TIMESTAMP WITHOUT TIME ZONE",
        "DATETIME",
      ].map((alias) => [alias, "TIMESTAMP_NTZ(9)"]),
      ...[
        "TIMESTAMP_LTZ",
        "TIMESTAMPLTZ",
        "TIMESTAMP WITH LOCAL TIME ZONE",
      ].map((alias) => [alias, "TIMESTAMP_LTZ(9)"]),
      ...[
        "TIMESTAMP_TZ",
        "TIMESTAMPTZ",
        "TIMESTAMP WITH TIME ZONE",
      ].map((alias) => [alias, "TIMESTAMP_TZ(9)"]),
      ...["VARIANT", "OBJECT", "ARRAY", "GEOGRAPHY", "GEOMETRY"].map(
        (family) => [family, family],
      ),
    ];

    const project = terraformHclToCanonicalProject(
      semanticTypeModule(
        aliases.map(([expression], index) => [`ALIAS_${index}`, expression]),
      ),
    );
    assert.deepEqual(
      project.physical_model.tables[0].columns.map(
        ({ data_type }) => data_type.text,
      ),
      aliases.map(([, expected]) => expected),
    );
  });

  it("requires explicit mapping for generic TIMESTAMP and preserves each mapping", async () => {
    const { terraformHclToCanonicalProject, terraformHclToDiagram } =
      await loadTerraformRoundTrip();
    const hcl = semanticTypeModule([["GENERIC_TIMESTAMP", "TIMESTAMP(3)"]]);

    assert.throws(
      () => terraformHclToCanonicalProject(hcl),
      /generic TIMESTAMP.*explicit.*timestampTypeMapping/i,
    );
    for (const mapping of [
      "TIMESTAMP_NTZ",
      "TIMESTAMP_LTZ",
      "TIMESTAMP_TZ",
    ]) {
      const project = terraformHclToCanonicalProject(hcl, {
        timestampTypeMapping: mapping,
      });
      assert.deepEqual(project.physical_model.tables[0].columns[0].data_type, {
        ...type(mapping, `${mapping}(3)`, 3),
      });
      const diagram = terraformHclToDiagram(hcl, {
        title: "timestamp-mapped",
        timestampTypeMapping: mapping,
      });
      assert.equal(diagram.tables[0].fields[0].type, mapping);
      assert.equal(diagram.tables[0].fields[0].size, 3);
    }
    assert.throws(
      () =>
        terraformHclToCanonicalProject(hcl, {
          timestampTypeMapping: "VARCHAR",
        }),
      /timestampTypeMapping.*concrete TIMESTAMP variant/i,
    );
  });

  it("applies explicit TIMESTAMP mapping while exporting a legacy v1 project", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const project = supportedCanonicalProject();
    project.project_version = "1";
    project.physical_model.model_version = "1";
    for (const table of project.physical_model.tables) {
      for (const column of table.columns) {
        const { family, text, precision, scale, length } = column.data_type;
        column.data_type = { family, text, precision, scale, length };
      }
    }
    project.physical_model.tables[0].columns[0].data_type = {
      family: "TIMESTAMP",
      text: "TIMESTAMP(3)",
      precision: 3,
      scale: null,
      length: null,
    };

    assert.throws(
      () => canonicalProjectToTerraformHcl(project),
      /generic TIMESTAMP.*explicit.*timestampTypeMapping/i,
    );
    const rendered = canonicalProjectToTerraformHcl(project, {
      timestampTypeMapping: "TIMESTAMP_LTZ",
    });
    assert.match(rendered, /type\s*=\s*"TIMESTAMP_LTZ\(3\)"/);

    const renderedModel = canonicalProjectToTerraformHcl(
      project.physical_model,
      { timestampTypeMapping: "TIMESTAMP_LTZ" },
    );
    assert.match(renderedModel, /type\s*=\s*"TIMESTAMP_LTZ\(3\)"/);
  });

  it("rejects unsupported structured/new types and incomplete VECTOR at the Terraform boundary", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();
    for (const typeExpression of [
      "OBJECT(VARCHAR)",
      "ARRAY(NUMBER)",
      "MAP(VARCHAR, NUMBER)",
      "DECFLOAT",
      "UUID",
      "VECTOR",
      "VECTOR(NUMBER, 3)",
      "VECTOR(FLOAT, 4097)",
    ]) {
      assert.throws(
        () =>
          terraformHclToCanonicalProject(
            semanticTypeModule([["UNSUPPORTED", typeExpression]]),
          ),
        /unsupported|parameters|VECTOR|dimension/i,
        typeExpression,
      );
    }

    const project = terraformHclToCanonicalProject(
      semanticTypeModule([["VECTOR_COL", "VECTOR(INT, 3)"]]),
    );
    const vector = project.physical_model.tables[0].columns[0].data_type;
    vector.element_type = null;
    vector.dimension = null;
    vector.text = "VECTOR";
    assert.throws(
      () => canonicalProjectToTerraformHcl(project),
      /VECTOR.*(?:element|dimension)|incomplete/i,
    );
  });

  it("rejects stale v2 type text instead of exporting it", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const project = supportedCanonicalProject();
    project.physical_model.tables[0].columns[0].data_type.text =
      "DECIMAL(38, 0)";
    assert.throws(
      () => canonicalProjectToTerraformHcl(project),
      /text must equal its canonical value/i,
    );
  });

  it("preserves Terraform default expression classification and escaped template text", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();
    const hcl = `
resource "snowflake_database" "analytics" { name = "ANALYTICS" }
resource "snowflake_schema" "core" {
  database = snowflake_database.analytics.name
  name     = "CORE"
}
resource "snowflake_table" "default_cases" {
  database = snowflake_schema.core.database
  schema   = snowflake_schema.core.name
  name     = "DEFAULT_CASES"
  comment  = "literal $\${var.env} and %%{ if false } text"

  column {
    name = "CURRENT_DATE_COL"
    type = "DATE"
    default {
      expression = "CURRENT_DATE"
    }
  }

  column {
    name = "CALL_SHAPED_LITERAL"
    type = "VARCHAR(64)"
    default {
      constant = "ABC(1)"
    }
  }

  column {
    name = "NULL_COL"
    type = "VARCHAR(64)"
    default {
      expression = "NULL"
    }
  }
}
`;

    const imported = terraformHclToCanonicalProject(hcl);
    const rendered = canonicalProjectToTerraformHcl(imported);
    const importedAgain = terraformHclToCanonicalProject(rendered);

    assert.match(
      rendered,
      /CURRENT_DATE_COL[\s\S]*default \{\s*expression = "CURRENT_DATE"\s*\}/,
    );
    assert.match(
      rendered,
      /CALL_SHAPED_LITERAL[\s\S]*default \{\s*constant = "ABC\(1\)"\s*\}/,
    );
    assert.match(
      rendered,
      /NULL_COL[\s\S]*default \{\s*expression = "NULL"\s*\}/,
    );
    assert.match(rendered, /literal \$\$\{var\.env\} and %%\{ if false \} text/);
    assert.equal(
      importedAgain.physical_model.tables[0].comment,
      "literal ${var.env} and %{ if false } text",
    );
    assert.deepEqual(
      terraformSemanticSnapshot(importedAgain),
      terraformSemanticSnapshot(imported),
    );
  });

  it("fails closed for malformed HCL and non-HCL module input", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();

    for (const [label, hcl, pattern] of [
      ["blank input", "   \n\t", /nonblank/i],
      [
        "unterminated block",
        'resource "snowflake_database" "analytics" { name = "ANALYTICS"',
        /malformed.*expected|unterminated/i,
      ],
      [
        "unterminated string",
        'resource "snowflake_database" "analytics" { name = "ANALYTICS }',
        /unterminated Terraform string/i,
      ],
      [
        "string interpolation",
        'resource "snowflake_database" "analytics" { name = "${var.database}" }',
        /unsupported Terraform string interpolation/i,
      ],
      [
        "template directive",
        'resource "snowflake_database" "analytics" { name = "%{ if true }ANALYTICS%{ endif }" }',
        /unsupported Terraform template directive/i,
      ],
      [
        "duplicate attribute",
        'resource "snowflake_database" "analytics" { name = "ANALYTICS" name = "ANALYTICS2" }',
        /duplicate Terraform attribute name/i,
      ],
      [
        "function expression",
        'resource "snowflake_database" "analytics" { name = upper("analytics") }',
        /unsupported Terraform token|malformed|expression/i,
      ],
    ]) {
      assert.throws(
        () => terraformHclToCanonicalProject(hcl, { name: label }),
        pattern,
        label,
      );
    }

    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          [
            { path: "main.tf", contents: supportedTerraformModule },
            { path: "main.tf", contents: supportedTerraformModule },
          ],
          { name: "duplicate-files" },
        ),
      /duplicate Terraform file path main\.tf/i,
    );
    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          [{ path: "variables.tf", contents: 'variable "database" {}' }],
          { name: "variables" },
        ),
      /unsupported Terraform block variable/i,
    );
    assert.throws(
      () => terraformHclToCanonicalProject({ contents: supportedTerraformModule }),
      /HCL text or an array of module files/i,
    );
  });

  it("rejects unsupported resources, unsupported expressions, and ambiguous references clearly", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();

    for (const [label, hcl, pattern] of [
      [
        "unsupported resource",
        'resource "snowflake_view" "customer_v" { database = "ANALYTICS" schema = "CORE" name = "CUSTOMER_V" statement = "SELECT 1" }',
        /unsupported.*snowflake_view/i,
      ],
      [
        "unsupported data source",
        'data "snowflake_database" "analytics" { name = "ANALYTICS" }',
        /unsupported Terraform block data/i,
      ],
      [
        "unsupported module",
        'module "warehouse" { source = "./warehouse" }',
        /unsupported Terraform block module/i,
      ],
      [
        "unsupported type",
        'resource "snowflake_table" "events" { database = "ANALYTICS" schema = "CORE" name = "EVENTS" column { name = "PAYLOAD" type = "XML" } }',
        /unsupported.*XML/i,
      ],
      [
        "unsupported table option",
        'resource "snowflake_table" "clustered" { database = "ANALYTICS" schema = "CORE" name = "CLUSTERED" cluster_by = ["to_date(CREATED_AT)"] column { name = "ID" type = "NUMBER(38, 0)" } }',
        /unsupported.*cluster_by/i,
      ],
      [
        "unsupported meta argument",
        'resource "snowflake_table" "customer" { database = "ANALYTICS" schema = "CORE" name = "CUSTOMER" count = 2 column { name = "ID" type = "NUMBER(38, 0)" } }',
        /unsupported.*count/i,
      ],
      [
        "ambiguous variable",
        'resource "snowflake_table" "customer" { database = var.database schema = "CORE" name = "CUSTOMER" column { name = "ID" type = "NUMBER(38, 0)" } }',
        /ambiguous|unsupported.*var\.database|variable/i,
      ],
      [
        "boolean identifier literal",
        'resource "snowflake_database" "analytics" { name = true }',
        /snowflake_database\.name must be a literal string/i,
      ],
      [
        "numeric table id literal",
        'resource "snowflake_table" "customer" { database = "ANALYTICS" schema = "CORE" name = 1 column { name = "ID" type = "NUMBER(38, 0)" } }',
        /snowflake_table\.name must be a literal string/i,
      ],
      [
        "ambiguous schema/database mismatch",
        `
resource "snowflake_schema" "core" { database = "ANALYTICS" name = "CORE" }
resource "snowflake_schema" "mart" { database = "ANALYTICS" name = "MART" }
resource "snowflake_table" "customer" {
  database = snowflake_schema.mart.database
  schema   = snowflake_schema.core.name
  name     = "CUSTOMER"
  column { name = "ID" type = "NUMBER(38, 0)" }
}`,
        /ambiguous Terraform table namespace/i,
      ],
      [
        "ambiguous literal database/schema mismatch",
        `
resource "snowflake_database" "analytics" { name = "ANALYTICS" }
resource "snowflake_schema" "core" { database = snowflake_database.analytics.name name = "CORE" }
resource "snowflake_table" "customer" {
  database = "OTHER_DB"
  schema   = snowflake_schema.core.name
  name     = "CUSTOMER"
  column { name = "ID" type = "NUMBER(38, 0)" }
}`,
        /ambiguous Terraform table namespace/i,
      ],
      [
        "unresolved table reference",
        'resource "snowflake_table_constraint" "fk" { name = "FK_BAD" type = "FOREIGN KEY" table_id = snowflake_table.missing.fully_qualified_name columns = ["ID"] foreign_key_properties { references { table_id = snowflake_table.other.fully_qualified_name columns = ["ID"] } } }',
        /unresolved|unknown|reference/i,
      ],
      [
        "labeled default block",
        `
resource "snowflake_table" "customer" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "CUSTOMER"
  column {
    name = "ID"
    type = "NUMBER(38, 0)"
    default "unsupported" { constant = "0" }
  }
}`,
        /Terraform default blocks must not have labels/i,
      ],
      [
        "unsupported foreign key property",
        `
resource "snowflake_table" "parent" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "PARENT"
  column { name = "ID" type = "NUMBER(38, 0)" }
}
resource "snowflake_table" "child" {
  database = "ANALYTICS"
  schema   = "CORE"
  name     = "CHILD"
  column { name = "PARENT_ID" type = "NUMBER(38, 0)" }
}
resource "snowflake_table_constraint" "fk_child_parent" {
  name     = "FK_CHILD_PARENT"
  type     = "FOREIGN KEY"
  table_id = snowflake_table.child.fully_qualified_name
  columns  = ["PARENT_ID"]
  foreign_key_properties {
    match_type = "FULL"
    references {
      table_id = snowflake_table.parent.fully_qualified_name
      columns  = ["ID"]
    }
  }
}`,
        /unsupported Terraform foreign_key_properties attribute match_type/i,
      ],
    ]) {
      assert.throws(
        () => terraformHclToCanonicalProject(hcl, { name: label }),
        pattern,
        label,
      );
    }
  });

  it("resolves schema database references independent of Terraform file order", async () => {
    const { terraformHclToCanonicalProject } = await loadTerraformRoundTrip();
    const files = [
      {
        path: "20-dependent-schema.tf",
        contents:
          'resource "snowflake_schema" "mart" { database = snowflake_schema.core.database name = "MART" }',
      },
      {
        path: "10-core-schema.tf",
        contents:
          'resource "snowflake_schema" "core" { database = snowflake_database.analytics.name name = "CORE" }',
      },
      {
        path: "00-database.tf",
        contents:
          'resource "snowflake_database" "analytics" { name = "ANALYTICS" }',
      },
      {
        path: "30-table.tf",
        contents:
          'resource "snowflake_table" "orders" { database = snowflake_schema.mart.database schema = snowflake_schema.mart.name name = "ORDERS" column { name = "ID" type = "NUMBER(38, 0)" } }',
      },
    ];

    const project = terraformHclToCanonicalProject(files);

    assert.deepEqual(
      project.physical_model.namespaces.map((namespace) => namespace.id),
      ["namespace:ANALYTICS.CORE", "namespace:ANALYTICS.MART"],
    );
    assert.equal(project.physical_model.tables[0].namespace_id, "namespace:ANALYTICS.MART");
  });

  it("rejects Terraform state and credential-bearing provider data and never emits secrets", async () => {
    const { terraformHclToCanonicalProject, canonicalProjectToTerraformHcl } =
      await loadTerraformRoundTrip();

    assert.throws(
      () =>
        terraformHclToCanonicalProject(terraformStateFixture(), {
          name: "state",
        }),
      /Terraform state|tfstate|not project data/i,
    );
    assert.throws(
      () =>
        terraformHclToCanonicalProject(credentialBearingProviderFixture(), {
          name: "credentials",
        }),
      /credential|secret|provider|password|token|private/i,
    );

    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          `
terraform {
  backend "s3" {
    bucket = "redacted-state-bucket"
    key    = "redacted.tfstate"
  }
}
`,
          { name: "backend" },
        ),
      /backend|state configuration|not imported/i,
    );
    assert.throws(
      () =>
        terraformHclToCanonicalProject(
          `
terraform {
  cloud {
    organization = "redacted"
    workspaces { name = "prod" }
  }
}
`,
          { name: "cloud" },
        ),
      /backend|cloud|state configuration|not imported/i,
    );

    const project = supportedCanonicalProject();
    project.backend = { token: "[REDACTED_STATE_OUTPUT]" };
    assert.throws(
      () => canonicalProjectToTerraformHcl(project),
      /backend|token|unexpected|forbidden|secret/i,
    );

    assertNoSecretMaterial(
      canonicalProjectToTerraformHcl(supportedCanonicalProject()),
    );
    assertNoSecretMaterial(JSON.stringify(supportedCanonicalProject()));
  });

  it("previews Terraform HCL for user review and does not invoke Terraform apply", async () => {
    const { canonicalProjectToTerraformHcl } = await loadTerraformRoundTrip();
    const source = fs.readFileSync(terraformRoundTripPath, "utf8");
    const controlPanelSource = fs.readFileSync(controlPanelPath, "utf8");
    const importModalSource = fs.readFileSync(importModalPath, "utf8");
    const importSourceSource = fs.readFileSync(importSourcePath, "utf8");
    const desktopBridgeSource = fs.readFileSync(desktopBridgePath, "utf8");
    const electronMainSource = fs.readFileSync(electronMainPath, "utf8");
    const commandCalls = [];

    const hcl = canonicalProjectToTerraformHcl(supportedCanonicalProject(), {
      commandRunner(command, args = []) {
        commandCalls.push([command, args]);
        return { status: 0, stdout: "", stderr: "" };
      },
    });

    assert.deepEqual(commandCalls, []);
    assert.doesNotMatch(hcl, /\bterraform\s+apply\b|\bapply\b/i);
    assert.match(controlPanelSource, /name:\s*"Snowflake Terraform"/);
    assert.match(controlPanelSource, /setImportSourceFormat\("terraform"\)/);
    assert.match(controlPanelSource, /name:\s*"Terraform HCL"/);
    assert.match(
      controlPanelSource,
      /openExportModal\(MODAL\.CODE\)[\s\S]*canonicalProjectToTerraformHcl\(project\)[\s\S]*extension:\s*"tf"/,
    );
    assert.match(importModalSource, /terraformHclToDiagram\(ast,\s*\{\s*title\s*\}\)/);
    assert.match(importModalSource, /setDatabase\(nextDatabase\)/);
    assert.match(importSourceSource, /language="hcl"/);
    assert.match(importSourceSource, /accept="\.tf"/);
    assert.doesNotMatch(
      [
        source,
        controlPanelSource,
        importModalSource,
        importSourceSource,
        desktopBridgeSource,
        electronMainSource,
      ].join("\n"),
      /\b(?:spawn|execFile|execFileSync|exec|execSync|apply)\s*\([^)]*terraform/i,
    );
  });

  it("preserves existing drawDB database providers and SQL import/export dispatch", () => {
    const mysqlDiagram = importSQL(
      minimalMySqlCreateTableAst(),
      DB.MYSQL,
      DB.GENERIC,
    );
    const sqliteDdl = exportSQL(sqliteRegressionFixture());

    assert.equal(mysqlDiagram.tables.length, 1);
    assert.equal(mysqlDiagram.tables[0].fields[0].primary, true);
    assert.match(sqliteDdl, /CREATE TABLE IF NOT EXISTS "users"/);
    assert.match(sqliteDdl, /PRIMARY KEY\("id"\)/);
  });
});
