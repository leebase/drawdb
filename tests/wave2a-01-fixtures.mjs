// v1 fixtures are serialized canonical projects, not editor-shaped examples.
// They are opened through the same JSON -> canonicalProjectToDiagram seam that
// native project files use.  A bare VECTOR remains explicitly unresolved: no
// test may invent an element type or dimension for it.

const coreNamespace = {
  id: "namespace:ANALYTICS.CORE",
  catalog: "ANALYTICS",
  schema: "CORE",
};

export const v1Fixtures = Object.freeze({
  nonVectorMigration: {
    version: "v1",
    expected: Object.freeze({
      exportable: true,
      status: "supported",
    }),
    serialized: {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "V1_SUPPORTED_EVENTS",
        namespaces: [coreNamespace],
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
                default: null,
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
    },
  },
  bareVector: {
    version: "v1",
    expected: Object.freeze({
      exportable: false,
      status: "unresolved",
      reason: "VECTOR requires an INT or FLOAT element type and a positive dimension",
    }),
    serialized: {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: "V1_UNRESOLVED_VECTOR",
        namespaces: [coreNamespace],
        tables: [
          {
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
            comment: "Bare vector must not be guessed",
          },
        ],
        relationships: [],
      },
      diagram_layout: {
        nodes: {
          "table:ANALYTICS.CORE.EMBEDDINGS": { x: 40, y: 80 },
        },
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    },
  },
  legacyFieldCheck: {
    expected: Object.freeze({
      expression: "AMOUNT >= 0",
      outcome: "migrate-or-typed-reject",
      // The compatibility seam must either migrate this legacy field-level
      // value into table.checkConstraints or return this exact typed error.
      // Silent omission is never an acceptable v1 behavior.
      typedReject: Object.freeze({
        code: "LEGACY_FIELD_CHECK_UNSUPPORTED",
        message:
          "Legacy field.check requires explicit migration to table.checkConstraints",
      }),
    }),
    diagram: {
      database: "snowflake",
      title: "LEGACY_FIELD_CHECK",
      tables: [
        {
          id: "legacy-checked",
          name: "LEGACY_CHECKED",
          x: 0,
          y: 0,
          fields: [
            {
              id: "legacy-amount",
              name: "AMOUNT",
              type: "NUMBER",
              size: "12,2",
              default: "",
              check: "AMOUNT >= 0",
              primary: false,
              unique: false,
              notNull: false,
              increment: false,
              comment: "Legacy field-level check",
            },
          ],
        },
      ],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
    },
  },
});

export const vectorFixtures = Object.freeze({
  valid: [
    Object.freeze({
      element: "INT",
      dimension: 3,
      size: "INT,3",
      ddlType: "VECTOR(INT, 3)",
    }),
    Object.freeze({
      element: "FLOAT",
      dimension: 1536,
      size: "FLOAT,1536",
      ddlType: "VECTOR(FLOAT, 1536)",
    }),
  ],
  invalid: [
    Object.freeze({ size: "INT", reason: "missing vector dimension" }),
    Object.freeze({ size: "NUMBER,3", reason: "unsupported element type" }),
    Object.freeze({ size: "INT,0", reason: "dimension must be positive" }),
    Object.freeze({ size: "FLOAT,-1", reason: "dimension must be positive" }),
    Object.freeze({ size: "FLOAT,3.5", reason: "dimension must be integer" }),
    Object.freeze({ size: "INT,4097", reason: "dimension exceeds Snowflake bound" }),
    Object.freeze({ size: "INT,3,4", reason: "too many parameters" }),
  ],
});

export function cloneFixture(fixture) {
  return JSON.parse(JSON.stringify(fixture));
}
