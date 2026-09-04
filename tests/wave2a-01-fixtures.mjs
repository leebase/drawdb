// v1 fixtures are intentionally explicit about whether a diagram is
// losslessly supported.  In particular, a bare VECTOR is unresolved: tests
// must reject it rather than inventing a type parameter or DDL spelling.

const emptyTransform = { pan: { x: 0, y: 0 }, zoom: 1 };

export const v1Fixtures = Object.freeze({
  nonVectorMigration: {
    version: "v1",
    expected: Object.freeze({
      exportable: true,
      status: "supported",
    }),
    diagram: {
      database: "snowflake",
      title: "V1_SUPPORTED_EVENTS",
      tables: [
        {
          id: "legacy-events",
          name: "EVENTS",
          x: 40,
          y: 80,
          comment: "Supported v1 fixture",
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "legacy-events-id",
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
              id: "legacy-events-label",
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
      transform: emptyTransform,
    },
  },
  bareVector: {
    version: "v1",
    expected: Object.freeze({
      exportable: false,
      status: "unresolved",
      reason: "VECTOR requires an INT or FLOAT element type and a positive dimension",
    }),
    diagram: {
      database: "snowflake",
      title: "V1_UNRESOLVED_VECTOR",
      tables: [
        {
          id: "legacy-vector",
          name: "EMBEDDINGS",
          x: 40,
          y: 80,
          comment: "Bare vector must not be guessed",
          namespace: {
            id: "namespace:ANALYTICS.CORE",
            catalog: "ANALYTICS",
            schema: "CORE",
          },
          fields: [
            {
              id: "legacy-vector-value",
              name: "VALUE",
              type: "VECTOR",
              size: "",
              default: "",
              check: "",
              primary: false,
              unique: false,
              notNull: false,
              increment: false,
              comment: "Missing element type and dimension",
            },
          ],
        },
      ],
      relationships: [],
      transform: emptyTransform,
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
