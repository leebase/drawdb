import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  renderCanonicalSnowflakeDDL,
  renderCanonicalSnowflakeStatements,
} from "../src/erdTool/projectAdapter.js";

function v1Project() {
  return {
    project_version: "1",
    physical_model: {
      model_version: "1",
      name: "V1_EVENTS",
      namespaces: [
        {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
      ],
      tables: [
        {
          id: "table:ANALYTICS.CORE.EVENTS",
          namespace_id: "namespace:ANALYTICS.CORE",
          name: "EVENTS",
          kind: "table",
          columns: [
            {
              id: "column:ANALYTICS.CORE.EVENTS.EVENT_ID",
              name: "EVENT_ID",
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
              comment: "Stable event id",
            },
            {
              id: "column:ANALYTICS.CORE.EVENTS.LABEL",
              name: "LABEL",
              ordinal: 2,
              data_type: {
                family: "VARCHAR",
                text: "VARCHAR(320)",
                precision: null,
                scale: null,
                length: 320,
              },
              nullable: true,
              default: "'event'",
              comment: "Human label",
            },
          ],
          constraints: [
            {
              id: "constraint:ANALYTICS.CORE.EVENTS.PK_EVENTS",
              name: "PK_EVENTS",
              kind: "primary_key",
              columns: ["column:ANALYTICS.CORE.EVENTS.EVENT_ID"],
              referenced_table_id: null,
              referenced_columns: [],
            },
          ],
          comment: "Supported v1 fixture",
        },
      ],
      relationships: [],
    },
    diagram_layout: {
      nodes: {
        "table:ANALYTICS.CORE.EVENTS": { x: 40, y: 80 },
      },
      viewport: { x: 0, y: 0, zoom: 1 },
    },
  };
}

function newDiagram() {
  return {
    database: "snowflake",
    title: "V2_EVENTS",
    tables: [
      {
        id: "events",
        name: "EVENTS",
        x: 40,
        y: 80,
        fields: [
          {
            id: "event-id",
            name: "EVENT_ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Stable event id",
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
            comment: "Human label",
          },
        ],
      },
    ],
    relationships: [],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

function v2Project() {
  return diagramToCanonicalProject(newDiagram());
}

function relationalDiagram() {
  return {
    database: "snowflake",
    title: "ORDER_FULFILLMENT",
    tables: [
      {
        id: "customers",
        name: "CUSTOMERS",
        x: 40,
        y: 80,
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        comment: "Customer master records",
        constraintView: {
          primaryKeyName: "PK_CUSTOMERS",
          uniqueNames: { email: "UQ_CUSTOMERS_EMAIL" },
        },
        fields: [
          {
            id: "customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Stable customer id",
          },
          {
            id: "email",
            name: "EMAIL",
            type: "VARCHAR",
            size: 320,
            default: "'unknown@example.com'",
            check: "",
            primary: false,
            unique: true,
            notNull: true,
            increment: false,
            comment: "Primary contact email",
          },
        ],
      },
      {
        id: "orders",
        name: "ORDERS",
        x: 360,
        y: 80,
        namespace: {
          id: "namespace:ANALYTICS.CORE",
          catalog: "ANALYTICS",
          schema: "CORE",
        },
        comment: "Customer order facts",
        constraintView: { primaryKeyName: "PK_ORDERS" },
        fields: [
          {
            id: "order-id",
            name: "ORDER_ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: true,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Stable order id",
          },
          {
            id: "customer-id",
            name: "CUSTOMER_ID",
            type: "NUMBER",
            size: "38,0",
            default: "",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Owning customer id",
          },
          {
            id: "created-at",
            name: "CREATED_AT",
            type: "TIMESTAMP_NTZ",
            size: 9,
            default: "CURRENT_TIMESTAMP",
            check: "",
            primary: false,
            unique: false,
            notNull: true,
            increment: false,
            comment: "Creation timestamp",
          },
        ],
      },
    ],
    relationships: [
      {
        id: "orders-customers",
        name: "FK_ORDERS_CUSTOMER",
        startTableId: "orders",
        startFieldId: "customer-id",
        endTableId: "customers",
        endFieldId: "customer-id",
        fields: [
          { startFieldId: "customer-id", endFieldId: "customer-id" },
        ],
        cardinality: "many_to_one",
        updateConstraint: "No action",
        deleteConstraint: "No action",
      },
    ],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };
}

function relationalProject() {
  return diagramToCanonicalProject(relationalDiagram());
}

const editorSemanticDivergences = [
  {
    label: "title/model name",
    mutate: (document) => {
      document.title = "ORDER_FULFILLMENT_V2";
    },
  },
  {
    label: "namespace catalog",
    mutate: (document) => {
      document.tables[0].namespace.catalog = "REPORTING";
    },
  },
  {
    label: "namespace schema",
    mutate: (document) => {
      document.tables[0].namespace.schema = "ARCHIVE";
    },
  },
  {
    label: "table name/identity",
    mutate: (document) => {
      document.tables[0].name = "CUSTOMER_ACCOUNTS";
    },
  },
  {
    label: "column name",
    mutate: (document) => {
      document.tables[0].fields[1].name = "LOGIN_EMAIL";
    },
  },
  {
    label: "type",
    mutate: (document) => {
      document.tables[0].fields[1].type = "NUMBER";
      document.tables[0].fields[1].size = "12,0";
    },
  },
  {
    label: "nullability",
    mutate: (document) => {
      document.tables[0].fields[1].notNull = false;
    },
  },
  {
    label: "default",
    mutate: (document) => {
      document.tables[1].fields[2].default = "CURRENT_DATE";
    },
  },
  {
    label: "column comment",
    mutate: (document) => {
      document.tables[0].fields[0].comment = "Customer surrogate key";
    },
  },
  {
    label: "table comment",
    mutate: (document) => {
      document.tables[1].comment = "Orders placed by customers";
    },
  },
  {
    label: "primary-key semantics",
    mutate: (document) => {
      document.tables[0].fields[0].primary = false;
    },
  },
  {
    label: "unique semantics",
    mutate: (document) => {
      document.tables[0].fields[1].unique = false;
    },
  },
  {
    label: "relationship name",
    mutate: (document) => {
      document.relationships[0].name = "FK_ORDERS_ACCOUNT";
    },
  },
  {
    label: "relationship endpoints",
    mutate: (document) => {
      const relationship = document.relationships[0];
      relationship.startTableId = "customers";
      relationship.startFieldId = "customer-id";
      relationship.endTableId = "orders";
      relationship.endFieldId = "customer-id";
      relationship.fields[0] = {
        startFieldId: "customer-id",
        endFieldId: "customer-id",
      };
    },
  },
];

function canonicalProjectWithEditorState() {
  const diagram = newDiagram();
  diagram.notes = [
    {
      id: "note-1",
      x: 12,
      y: 24,
      title: "Events",
      content: "Stable event identifiers",
      color: "#f5d90a",
      height: 120,
      width: 240,
      locked: true,
    },
  ];
  diagram.areas = [
    {
      id: "area-1",
      name: "Analytics",
      x: 0,
      y: 0,
      width: 640,
      height: 360,
      locked: false,
      color: "#dbeafe",
    },
  ];
  diagram.types = [
    {
      id: "type-1",
      name: "EVENT_ID_TYPE",
      fields: [{ id: "type-field-1", name: "VALUE", type: "NUMBER" }],
      comment: "Event identifier type",
    },
  ];
  diagram.enums = [
    {
      id: "enum-1",
      name: "EVENT_STATUS",
      values: ["ACTIVE", "ARCHIVED"],
    },
  ];
  return { diagram, project: diagramToCanonicalProject(diagram) };
}

function bareVectorV1Project() {
  const project = v1Project();
  project.physical_model.name = "V1_UNRESOLVED_VECTOR";
  project.physical_model.tables[0] = {
    id: "table:ANALYTICS.CORE.EMBEDDINGS",
    namespace_id: "namespace:ANALYTICS.CORE",
    name: "EMBEDDINGS",
    kind: "table",
    columns: [
      {
        id: "column:ANALYTICS.CORE.EMBEDDINGS.VALUE",
        name: "VALUE",
        ordinal: 1,
        data_type: {
          family: "VECTOR",
          text: "VECTOR",
          precision: null,
          scale: null,
          length: null,
        },
        nullable: true,
        default: null,
        comment: "Missing element type and dimension",
      },
    ],
    constraints: [],
    comment: "Bare vector must remain unresolved",
  };
  project.diagram_layout.nodes = {
    "table:ANALYTICS.CORE.EMBEDDINGS": { x: 40, y: 80 },
  };
  return project;
}

describe("Wave 2A canonical v2 migration scaffold", () => {
  for (const { label, mutate } of editorSemanticDivergences) {
    it(`rejects independently valid editor divergence: ${label}`, () => {
      const candidate = JSON.parse(JSON.stringify(relationalProject()));
      mutate(candidate.drawdb_document);
      const before = JSON.stringify(candidate);

      assert.doesNotThrow(
        () => diagramToCanonicalProject(candidate.drawdb_document),
        `${label} mutation must remain a valid editor document`,
      );
      assert.throws(
        () => canonicalProjectToDiagram(candidate),
        (error) => {
          assert.equal(error?.code, "CANONICAL_EDITOR_SEMANTIC_MISMATCH");
          assert.equal(
            error?.message,
            "drawdb_document semantics do not match authoritative physical_model",
          );
          return true;
        },
      );
      assert.equal(
        JSON.stringify(candidate),
        before,
        `${label} mismatch must not mutate the input project`,
      );
    });
  }

  it("migrates v1 physical state while reconciling a matching embedded editor", () => {
    const validV2 = relationalProject();
    const expectedPhysical = JSON.parse(
      JSON.stringify(validV2.physical_model),
    );
    const legacyInput = JSON.parse(JSON.stringify(validV2));
    legacyInput.physical_model.model_version = "1";
    for (const table of legacyInput.physical_model.tables) {
      delete table.check_constraints;
      for (const column of table.columns) {
        delete column.data_type.vector_element_type;
        delete column.data_type.vector_dimension;
      }
    }
    const inputBefore = JSON.stringify(legacyInput);

    const serializedDiagram = JSON.stringify(canonicalProjectToDiagram(legacyInput));
    assert.equal(
      JSON.stringify(legacyInput),
      inputBefore,
      "opening a legacy project must not mutate its input",
    );
    const reopenedDiagram = JSON.parse(serializedDiagram);
    const diagramBefore = JSON.stringify(reopenedDiagram);
    const migrated = diagramToCanonicalProject(reopenedDiagram);

    assert.equal(JSON.stringify(reopenedDiagram), diagramBefore);
    assert.equal(migrated.physical_model.model_version, "2");
    assert.deepEqual(migrated.physical_model, expectedPhysical);
  });

  it("migrates serialized v1 non-vector state to v2 without semantic loss", () => {
    const serialized = JSON.parse(JSON.stringify(v1Project()));
    const before = JSON.stringify(serialized);

    const diagram = canonicalProjectToDiagram(serialized);
    const migrated = diagramToCanonicalProject(diagram);

    assert.equal(migrated.project_version, "1");
    assert.equal(migrated.physical_model.model_version, "2");
    assert.equal(JSON.stringify(serialized), before);
    assert.deepEqual(
      migrated.physical_model.tables[0].constraints,
      v1Project().physical_model.tables[0].constraints,
    );
    assert.deepEqual(
      migrated.physical_model.tables[0].columns.map(
        (column) => column.data_type,
      ),
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
          family: "VARCHAR",
          text: "VARCHAR(320)",
          precision: null,
          scale: null,
          length: 320,
          vector_element_type: null,
          vector_dimension: null,
        },
      ],
    );
    assert.deepEqual(migrated.physical_model.tables[0].check_constraints, []);
  });

  it("emits v2 physical writes with nullable vector fields and empty checks", () => {
    const project = v2Project();

    assert.equal(project.project_version, "1");
    assert.equal(project.physical_model.model_version, "2");
    for (const column of project.physical_model.tables[0].columns) {
      assert.deepEqual(
        {
          vector_element_type: column.data_type.vector_element_type,
          vector_dimension: column.data_type.vector_dimension,
        },
        { vector_element_type: null, vector_dimension: null },
      );
    }
    assert.deepEqual(project.physical_model.tables[0].check_constraints, []);
  });

  it("reopens a canonical project while preserving editor-only arrays", () => {
    const { diagram, project } = canonicalProjectWithEditorState();
    const reopened = canonicalProjectToDiagram(
      JSON.parse(JSON.stringify(project)),
    );

    assert.deepEqual(reopened.notes, diagram.notes);
    assert.deepEqual(reopened.areas, diagram.areas);
    assert.deepEqual(reopened.types, diagram.types);
    assert.deepEqual(reopened.enums, diagram.enums);
  });

  it("rejects an editor document whose field name disagrees with physical_model", () => {
    const { project } = canonicalProjectWithEditorState();
    const mismatching = JSON.parse(JSON.stringify(project));
    mismatching.drawdb_document.tables[0].fields[0].name = "EVENT_KEY";

    assert.throws(
      () => canonicalProjectToDiagram(mismatching),
      (error) => {
        assert.equal(error?.code, "CANONICAL_EDITOR_SEMANTIC_MISMATCH");
        assert.equal(
          error?.message,
          "drawdb_document semantics do not match authoritative physical_model",
        );
        return true;
      },
    );
  });

  it("does not mutate mismatching project JSON while opening it", () => {
    const { project } = canonicalProjectWithEditorState();
    const mismatching = JSON.parse(JSON.stringify(project));
    mismatching.drawdb_document.tables[0].fields[0].name = "EVENT_KEY";
    const before = JSON.stringify(mismatching);

    assert.throws(() => canonicalProjectToDiagram(mismatching));
    assert.equal(JSON.stringify(mismatching), before);
  });

  it("keeps v2 migration and JSON serialize/reopen idempotent", () => {
    const first = diagramToCanonicalProject(
      canonicalProjectToDiagram(JSON.parse(JSON.stringify(v1Project()))),
    );
    const reopened = JSON.parse(JSON.stringify(first));
    const second = diagramToCanonicalProject(
      canonicalProjectToDiagram(reopened),
    );
    const third = diagramToCanonicalProject(
      canonicalProjectToDiagram(JSON.parse(JSON.stringify(second))),
    );

    assert.equal(JSON.stringify(second), JSON.stringify(first));
    assert.equal(JSON.stringify(third), JSON.stringify(second));
  });

  it("keeps migrated bare VECTOR unresolved while both canonical renderers fail closed", () => {
    const opened = canonicalProjectToDiagram(
      JSON.parse(JSON.stringify(bareVectorV1Project())),
    );
    const migrated = diagramToCanonicalProject(opened);
    const reopened = diagramToCanonicalProject(
      canonicalProjectToDiagram(JSON.parse(JSON.stringify(migrated))),
    );
    const dataType = reopened.physical_model.tables[0].columns[0].data_type;

    assert.deepEqual(
      {
        family: dataType.family,
        text: dataType.text,
        vector_element_type: dataType.vector_element_type,
        vector_dimension: dataType.vector_dimension,
      },
      {
        family: "VECTOR",
        text: "VECTOR",
        vector_element_type: null,
        vector_dimension: null,
      },
    );

    for (const render of [
      renderCanonicalSnowflakeDDL,
      renderCanonicalSnowflakeStatements,
    ]) {
      assert.throws(
        () => render(reopened),
        (error) => {
          assert.equal(error?.code, "UNRESOLVED_VECTOR");
          assert.match(
            error?.message ?? "",
            /VECTOR.*element type.*dimension/i,
          );
          return true;
        },
      );
    }
  });

  it("rejects nonempty legacy Snowflake field.check but accepts empty checks", () => {
    const withLegacyCheck = newDiagram();
    withLegacyCheck.tables[0].fields[0].check = "AMOUNT >= 0";
    assert.throws(
      () => diagramToCanonicalProject(withLegacyCheck),
      (error) => {
        assert.equal(error?.code, "LEGACY_FIELD_CHECK_UNSUPPORTED");
        assert.equal(
          error?.message,
          "Legacy field.check requires explicit migration to table.checkConstraints",
        );
        return true;
      },
    );

    for (const check of ["", "   "]) {
      const emptyCheck = newDiagram();
      emptyCheck.tables[0].fields[0].check = check;
      assert.doesNotThrow(() => diagramToCanonicalProject(emptyCheck));
    }
  });

  it("requires exact v2 scaffold keys and rejects inconsistent additions", () => {
    const missingTypeKey = v2Project();
    delete missingTypeKey.physical_model.tables[0].columns[0].data_type
      .vector_dimension;
    assert.throws(
      () => canonicalProjectToDiagram(missingTypeKey),
      /missing required vector_dimension/i,
    );

    const unknownTypeKey = v2Project();
    unknownTypeKey.physical_model.tables[0].columns[0].data_type.unexpected =
      null;
    assert.throws(
      () => canonicalProjectToDiagram(unknownTypeKey),
      /unexpected field unexpected/i,
    );

    const missingChecks = v2Project();
    delete missingChecks.physical_model.tables[0].check_constraints;
    assert.throws(
      () => canonicalProjectToDiagram(missingChecks),
      /missing required check_constraints/i,
    );

    const nonemptyChecks = v2Project();
    nonemptyChecks.physical_model.tables[0].check_constraints = [{}];
    assert.throws(
      () => canonicalProjectToDiagram(nonemptyChecks),
      /check_constraints.*empty/i,
    );

    const nonVectorParameters = v2Project();
    nonVectorParameters.physical_model.tables[0].columns[0].data_type.vector_element_type =
      "INT";
    assert.throws(
      () => canonicalProjectToDiagram(nonVectorParameters),
      /vector_element_type.*null.*NUMBER/i,
    );

    const inconsistentVector = v2Project();
    inconsistentVector.physical_model.tables[0].columns[0].data_type = {
      family: "VECTOR",
      text: "VECTOR",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: "INT",
      vector_dimension: null,
    };
    assert.throws(
      () => canonicalProjectToDiagram(inconsistentVector),
      /vector_element_type.*remain null.*VECTOR/i,
    );

    const unknownVersion = v2Project();
    unknownVersion.physical_model.model_version = "3";
    assert.throws(
      () => canonicalProjectToDiagram(unknownVersion),
      /unsupported model_version.*1.*2/i,
    );
  });
});
