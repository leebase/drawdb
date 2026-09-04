import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import { SnowflakeCheckError } from "../src/erdTool/projectAdapter.js";
import { createSnowflakeService } from "../src/electron/snowflakeService.js";
import { snowflakeMetadataToDiagram } from "../src/erdTool/snowflakeMetadata.js";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function temporaryConfig() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "drawdb-snowflake-"));
  temporaryDirectories.push(directory);
  const keyPath = path.join(directory, "test-key.p8");
  fs.writeFileSync(keyPath, "test fixture key", "utf8");
  const configPath = path.join(directory, "config.toml");
  fs.writeFileSync(
    configPath,
    [
      'default_connection_name = "erd-tool"',
      "",
      "[connections.erd-tool]",
      'account = "LEE_ACCOUNT"',
      'user = "LEE"',
      'authenticator = "SNOWFLAKE_JWT"',
      `private_key_file = ${JSON.stringify(keyPath)}`,
      'warehouse = "COMPUTE_WH"',
      'role = "ACCOUNTADMIN"',
      "",
    ].join("\n"),
    "utf8",
  );
  return { directory, configPath, keyPath };
}

function fakeDriver({
  connectionError,
  vectorMetadata = false,
  checkMetadata = [],
  checkTableConstraints = [],
  checkFetchError = null,
} = {}) {
  const observed = { connectionOptions: null, queries: [], destroyed: 0 };
  const rowsFor = (sqlText) => {
    if (sqlText.startsWith("SELECT CURRENT_ACCOUNT")) {
      return [
        {
          ACCOUNT: "LEE_ACCOUNT",
          USERNAME: "LEE",
          ROLE: "ACCOUNTADMIN",
          WAREHOUSE: "COMPUTE_WH",
        },
      ];
    }
    if (sqlText === "SHOW DATABASES") {
      return [{ name: "CHINOOK", kind: "STANDARD", comment: "Demo database" }];
    }
    if (sqlText.startsWith("SHOW SCHEMAS")) {
      return [{ name: "PUBLIC", database_name: "CHINOOK", comment: "" }];
    }
    if (sqlText.startsWith("SHOW TERSE TABLES")) {
      return [
        { name: "ALBUM", database_name: "CHINOOK", schema_name: "PUBLIC", rows: 347 },
        { name: "ARTIST", database_name: "CHINOOK", schema_name: "PUBLIC", rows: 275 },
      ];
    }
    if (sqlText.startsWith("DESCRIBE TABLE")) {
      if (!vectorMetadata) throw new Error(`Unexpected test query: ${sqlText}`);
      return [
        {
          NAME: "EMBEDDING",
          TYPE: "VECTOR(FLOAT, 1536)",
          KIND: "COLUMN",
          NULL: "Y",
          DEFAULT: null,
          COMMENT: "Album embedding",
        },
        {
          NAME: "TITLE_VECTOR",
          TYPE: "VECTOR(INT, 3)",
          KIND: "COLUMN",
          NULL: "Y",
          DEFAULT: null,
          COMMENT: "Compact title embedding",
        },
      ];
    }
    if (sqlText.includes(".CHECK_CONSTRAINTS")) {
      if (checkFetchError) throw checkFetchError;
      return checkMetadata;
    }
    if (sqlText.startsWith("SHOW PRIMARY KEYS")) {
      return [
        showKey("ALBUM", "PK_ALBUM", "ALBUM_ID", 1),
        showKey("ARTIST", "PK_ARTIST", "ARTIST_ID", 1),
      ];
    }
    if (sqlText.startsWith("SHOW UNIQUE KEYS")) return [];
    if (sqlText.startsWith("SHOW IMPORTED KEYS")) {
      return [
        {
          fk_database_name: "CHINOOK",
          fk_schema_name: "PUBLIC",
          fk_table_name: "ALBUM",
          fk_column_name: "ARTIST_ID",
          fk_name: "FK_ALBUM_ARTIST",
          pk_database_name: "CHINOOK",
          pk_schema_name: "PUBLIC",
          pk_table_name: "ARTIST",
          pk_column_name: "ARTIST_ID",
          pk_name: "PK_ARTIST",
          key_sequence: 1,
        },
      ];
    }
    if (sqlText.includes(".SCHEMATA")) {
      return [{ CATALOG_NAME: "CHINOOK", SCHEMA_NAME: "PUBLIC", COMMENT: "" }];
    }
    if (sqlText.includes(".TABLES")) {
      return [
        {
          TABLE_CATALOG: "CHINOOK",
          TABLE_SCHEMA: "PUBLIC",
          TABLE_NAME: "ALBUM",
          TABLE_TYPE: "BASE TABLE",
          COMMENT: "Albums",
        },
        {
          TABLE_CATALOG: "CHINOOK",
          TABLE_SCHEMA: "PUBLIC",
          TABLE_NAME: "ARTIST",
          TABLE_TYPE: "BASE TABLE",
          COMMENT: "Artists",
        },
      ];
    }
    if (sqlText.includes(".COLUMNS")) {
      if (vectorMetadata) {
        return [
          column("ALBUM", "ALBUM_ID", 1, "NUMBER", false),
          column("ALBUM", "ARTIST_ID", 2, "NUMBER", false),
          column("ALBUM", "EMBEDDING", 3, "VECTOR", true),
          column("ALBUM", "TITLE_VECTOR", 4, "VECTOR", true),
          column("ARTIST", "ARTIST_ID", 1, "NUMBER", false),
          column("ARTIST", "NAME", 2, "TEXT", true),
        ];
      }
      return [
        column("ALBUM", "ALBUM_ID", 1, "NUMBER", false),
        column("ALBUM", "TITLE", 2, "TEXT", false),
        column("ALBUM", "ARTIST_ID", 3, "NUMBER", false),
        column("ARTIST", "ARTIST_ID", 1, "NUMBER", false),
        column("ARTIST", "NAME", 2, "TEXT", true),
      ];
    }
    if (sqlText.includes(".TABLE_CONSTRAINTS")) {
      return [
        constraint("ALBUM", "PK_ALBUM", "PRIMARY KEY"),
        constraint("ALBUM", "FK_ALBUM_ARTIST", "FOREIGN KEY"),
        constraint("ARTIST", "PK_ARTIST", "PRIMARY KEY"),
        ...checkTableConstraints,
      ];
    }
    if (sqlText.includes(".KEY_COLUMN_USAGE")) {
      return [
        usage("ALBUM", "PK_ALBUM", "ALBUM_ID", 1),
        { ...usage("ALBUM", "FK_ALBUM_ARTIST", "ARTIST_ID", 1), POSITION_IN_UNIQUE_CONSTRAINT: 1 },
        usage("ARTIST", "PK_ARTIST", "ARTIST_ID", 1),
      ];
    }
    if (sqlText.includes(".REFERENTIAL_CONSTRAINTS")) {
      return [
        {
          CONSTRAINT_CATALOG: "CHINOOK",
          CONSTRAINT_SCHEMA: "PUBLIC",
          CONSTRAINT_NAME: "FK_ALBUM_ARTIST",
          UNIQUE_CONSTRAINT_CATALOG: "CHINOOK",
          UNIQUE_CONSTRAINT_SCHEMA: "PUBLIC",
          UNIQUE_CONSTRAINT_NAME: "PK_ARTIST",
        },
      ];
    }
    if (sqlText.startsWith("CREATE ") || sqlText.startsWith("ALTER ")) {
      return [{ status: "Statement executed successfully." }];
    }
    throw new Error(`Unexpected test query: ${sqlText}`);
  };

  const connection = {
    connect(callback) {
      queueMicrotask(() => callback(connectionError));
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
    normalizeConnectionOptions(options) {
      return {
        ...options,
        username: options.username ?? options.user,
        privateKeyPath: options.privateKeyPath ?? options.private_key_file,
      };
    },
    createConnection(options) {
      observed.connectionOptions = options;
      return connection;
    },
  };
}

function column(tableName, columnName, ordinal, dataType, nullable) {
  return {
    TABLE_CATALOG: "CHINOOK",
    TABLE_SCHEMA: "PUBLIC",
    TABLE_NAME: tableName,
    COLUMN_NAME: columnName,
    ORDINAL_POSITION: ordinal,
    COLUMN_DEFAULT: null,
    IS_NULLABLE: nullable ? "YES" : "NO",
    DATA_TYPE: dataType,
    CHARACTER_MAXIMUM_LENGTH: ["VARCHAR", "TEXT"].includes(dataType) ? 255 : null,
    NUMERIC_PRECISION: dataType === "NUMBER" ? 38 : null,
    NUMERIC_SCALE: dataType === "NUMBER" ? 0 : null,
    DATETIME_PRECISION: null,
    COMMENT: "",
  };
}

function constraint(tableName, name, type) {
  return {
    CONSTRAINT_CATALOG: "CHINOOK",
    CONSTRAINT_SCHEMA: "PUBLIC",
    CONSTRAINT_NAME: name,
    TABLE_CATALOG: "CHINOOK",
    TABLE_SCHEMA: "PUBLIC",
    TABLE_NAME: tableName,
    CONSTRAINT_TYPE: type,
  };
}

function checkConstraint(tableName, name) {
  return constraint(tableName, name, "CHECK");
}

function checkConstraintsRow(tableName, name, clause) {
  return {
    CONSTRAINT_CATALOG: "CHINOOK",
    CONSTRAINT_SCHEMA: "PUBLIC",
    CONSTRAINT_TABLE: tableName,
    CONSTRAINT_NAME: name,
    CHECK_CLAUSE: clause,
  };
}

function usage(tableName, constraintName, columnName, ordinal) {
  return {
    CONSTRAINT_CATALOG: "CHINOOK",
    CONSTRAINT_SCHEMA: "PUBLIC",
    CONSTRAINT_NAME: constraintName,
    TABLE_CATALOG: "CHINOOK",
    TABLE_SCHEMA: "PUBLIC",
    TABLE_NAME: tableName,
    COLUMN_NAME: columnName,
    ORDINAL_POSITION: ordinal,
    POSITION_IN_UNIQUE_CONSTRAINT: null,
  };
}

function showKey(tableName, constraintName, columnName, keySequence) {
  return {
    database_name: "CHINOOK",
    schema_name: "PUBLIC",
    table_name: tableName,
    column_name: columnName,
    constraint_name: constraintName,
    key_sequence: keySequence,
  };
}

describe("live Snowflake Electron-main service", () => {
  it("discovers Snowflake CLI profiles without exposing key material", () => {
    const { directory, configPath, keyPath } = temporaryConfig();
    const driver = fakeDriver();
    const service = createSnowflakeService({
      driver,
      homeDirectory: directory,
      configPaths: [configPath],
    });

    assert.deepEqual(service.listProfiles(), [
      {
        name: "erd-tool",
        isDefault: true,
        account: "LEE_ACCOUNT",
        username: "LEE",
        authenticator: "SNOWFLAKE_JWT",
        warehouse: "COMPUTE_WH",
        role: "ACCOUNTADMIN",
        database: "",
        schema: "",
      },
    ]);
    assert.doesNotMatch(JSON.stringify(service.listProfiles()), /test-key|private|password/i);
    assert.equal(fs.existsSync(keyPath), true);
  });

  it("connects by profile and returns only a disposable main-owned session", async () => {
    const { directory, configPath, keyPath } = temporaryConfig();
    const driver = fakeDriver();
    const service = createSnowflakeService({
      driver,
      homeDirectory: directory,
      configPaths: [configPath],
      createId: () => "session-1",
    });

    const result = await service.connect({ mode: "profile", profileName: "erd-tool" });
    assert.deepEqual(result, {
      sessionId: "session-1",
      profileName: "erd-tool",
      account: "LEE_ACCOUNT",
      username: "LEE",
      role: "ACCOUNTADMIN",
      warehouse: "COMPUTE_WH",
    });
    assert.equal(driver.observed.connectionOptions.privateKeyPath, keyPath);
    assert.equal(driver.observed.connectionOptions.application, "DRAWDB_ERD_TOOL");
    assert.equal(driver.observed.connectionOptions.clientSessionKeepAlive, false);
    assert.doesNotMatch(JSON.stringify(result), /private|password|token/i);

    assert.deepEqual(await service.disconnect("session-1"), { disconnected: true });
    assert.equal(driver.observed.destroyed, 1);
  });

  it("lists objects and converts selected live metadata into an editable diagram", async () => {
    const { directory, configPath } = temporaryConfig();
    const driver = fakeDriver();
    const service = createSnowflakeService({
      driver,
      homeDirectory: directory,
      configPaths: [configPath],
      createId: () => "session-2",
    });
    await service.connect({ mode: "profile", profileName: "erd-tool" });

    assert.deepEqual(await service.listDatabases("session-2"), [
      { name: "CHINOOK", kind: "STANDARD", comment: "Demo database", supported: true },
    ]);
    assert.deepEqual(await service.listSchemas("session-2", "CHINOOK"), [
      { name: "PUBLIC", database: "CHINOOK", comment: "", supported: true },
    ]);
    assert.equal((await service.listTables("session-2", "CHINOOK", "PUBLIC")).length, 2);

    const metadata = await service.reverseEngineer({
      sessionId: "session-2",
      database: "CHINOOK",
      schema: "PUBLIC",
      tables: ["ALBUM", "ARTIST"],
    });
    assert.equal(metadata.tables.length, 2);
    assert.equal(metadata.columns.length, 5);
    assert.equal(metadata.columns.find(({ column_name }) => column_name === "TITLE").data_type, "TEXT");
    assert.equal(metadata.referentialConstraints.length, 1);
    assert.doesNotMatch(JSON.stringify(metadata), /password|privateKey|session-2|token/i);

    const diagram = snowflakeMetadataToDiagram(metadata, {
      title: "CHINOOK.PUBLIC",
    });
    assert.equal(diagram.database, "snowflake");
    assert.equal(diagram.tables.length, 2);
    assert.equal(diagram.relationships.length, 1);
    assert.equal(diagram.relationships[0].name, "FK_ALBUM_ARTIST");

    const informationSchemaQueries = driver.observed.queries.filter(({ sqlText }) =>
      sqlText.includes("INFORMATION_SCHEMA"),
    );
    assert.ok(informationSchemaQueries.length >= 4);
    assert.ok(
      informationSchemaQueries.every(
        ({ sqlText }) => !sqlText.includes("ALBUM'") && !sqlText.includes("ARTIST'"),
      ),
    );
    assert.ok(
      informationSchemaQueries.some(
        ({ binds }) => binds.includes("ALBUM") && binds.includes("ARTIST"),
      ),
    );
    assert.ok(
      driver.observed.queries.some(({ sqlText }) =>
        sqlText.startsWith("SHOW IMPORTED KEYS IN SCHEMA"),
      ),
    );
  });

  it("DESCRIBEs only selected tables containing VECTOR columns and returns exact signatures", async () => {
    const { directory, configPath } = temporaryConfig();
    const driver = fakeDriver({ vectorMetadata: true });
    const service = createSnowflakeService({
      driver,
      homeDirectory: directory,
      configPaths: [configPath],
      createId: () => "session-vector",
    });
    await service.connect({ mode: "profile", profileName: "erd-tool" });

    const metadata = await service.reverseEngineer({
      sessionId: "session-vector",
      database: "CHINOOK",
      schema: "PUBLIC",
      tables: ["ALBUM", "ARTIST"],
    });
    const describeQueries = driver.observed.queries.filter(({ sqlText }) =>
      sqlText.startsWith("DESCRIBE TABLE"),
    );
    assert.equal(describeQueries.length, 1);
    assert.equal(describeQueries[0].sqlText, 'DESCRIBE TABLE "CHINOOK"."PUBLIC"."ALBUM"');
    assert.deepEqual(
      metadata.describeRows.map(({ table_catalog, table_schema, table_name, name, type }) =>
        ({ table_catalog, table_schema, table_name, name, type })),
      [
        {
          table_catalog: "CHINOOK",
          table_schema: "PUBLIC",
          table_name: "ALBUM",
          name: "EMBEDDING",
          type: "VECTOR(FLOAT, 1536)",
        },
        {
          table_catalog: "CHINOOK",
          table_schema: "PUBLIC",
          table_name: "ALBUM",
          name: "TITLE_VECTOR",
          type: "VECTOR(INT, 3)",
        },
      ],
    );

    const diagram = snowflakeMetadataToDiagram(metadata, {
      title: "CHINOOK.PUBLIC",
    });
    const album = diagram.tables.find(({ name }) => name === "ALBUM");
    assert.deepEqual(
      album.fields
        .filter(({ type }) => type === "VECTOR")
        .map(({ name, type, size }) => ({ name, type, size })),
      [
        { name: "EMBEDDING", type: "VECTOR", size: "FLOAT,1536" },
        { name: "TITLE_VECTOR", type: "VECTOR", size: "INT,3" },
      ],
    );
  });

  it("fetches bounded CHECK metadata for every selected base table and preserves clauses", async () => {
    const { directory, configPath } = temporaryConfig();
    const driver = fakeDriver({
      checkTableConstraints: [
        checkConstraint("ALBUM", "CK_ALBUM"),
        checkConstraint("ARTIST", "CK_ARTIST"),
      ],
      checkMetadata: [
        checkConstraintsRow(
          "ALBUM",
          "CK_ALBUM",
          "  ALBUM_ID > 0 AND (TITLE <> 'draft')  ",
        ),
        checkConstraintsRow("ARTIST", "CK_ARTIST", "LENGTH(NAME) > 0"),
      ],
    });
    const service = createSnowflakeService({
      driver,
      homeDirectory: directory,
      configPaths: [configPath],
      createId: () => "session-check",
    });
    await service.connect({ mode: "profile", profileName: "erd-tool" });

    const metadata = await service.reverseEngineer({
      sessionId: "session-check",
      database: "CHINOOK",
      schema: "PUBLIC",
      tables: ["ALBUM", "ARTIST"],
    });
    assert.deepEqual(
      metadata.checkConstraints.map(({ constraint_catalog, constraint_schema, constraint_table, constraint_name, check_clause }) =>
        ({ constraint_catalog, constraint_schema, constraint_table, constraint_name, check_clause })),
      [
        {
          constraint_catalog: "CHINOOK",
          constraint_schema: "PUBLIC",
          constraint_table: "ALBUM",
          constraint_name: "CK_ALBUM",
          check_clause: "  ALBUM_ID > 0 AND (TITLE <> 'draft')  ",
        },
        {
          constraint_catalog: "CHINOOK",
          constraint_schema: "PUBLIC",
          constraint_table: "ARTIST",
          constraint_name: "CK_ARTIST",
          check_clause: "LENGTH(NAME) > 0",
        },
      ],
    );
    const checkQuery = driver.observed.queries.find(({ sqlText }) =>
      sqlText.includes(".CHECK_CONSTRAINTS"),
    );
    assert.ok(checkQuery);
    assert.match(checkQuery.sqlText, /CONSTRAINT_TABLE IN \(\?, \?\)/);
    assert.deepEqual(checkQuery.binds, ["PUBLIC", "ALBUM", "ARTIST"]);
    const tableConstraintQuery = driver.observed.queries.find(({ sqlText }) =>
      sqlText.includes(".TABLE_CONSTRAINTS"),
    );
    assert.match(tableConstraintQuery.sqlText, /'CHECK'/);

    const diagram = snowflakeMetadataToDiagram(metadata, {
      title: "CHINOOK.PUBLIC",
    });
    assert.deepEqual(
      diagram.tables
        .filter((table) => table.checkConstraints?.length)
        .map(({ name, checkConstraints }) => ({ name, checkConstraints })),
      [
        {
          name: "ALBUM",
          checkConstraints: [
            {
              id: "constraint:CHINOOK.PUBLIC.ALBUM.CK_ALBUM",
              name: "CK_ALBUM",
              expression: "ALBUM_ID > 0 AND (TITLE <> 'draft')",
            },
          ],
        },
        {
          name: "ARTIST",
          checkConstraints: [
            {
              id: "constraint:CHINOOK.PUBLIC.ARTIST.CK_ARTIST",
              name: "CK_ARTIST",
              expression: "LENGTH(NAME) > 0",
            },
          ],
        },
      ],
    );
  });

  it("fails the whole reverse-engineering request with typed CHECK errors", async () => {
    const { directory, configPath } = temporaryConfig();
    const connectService = (driver, id) => {
      const service = createSnowflakeService({
        driver,
        homeDirectory: directory,
        configPaths: [configPath],
        createId: () => id,
      });
      return service;
    };
    const request = (sessionId) => ({
      sessionId,
      database: "CHINOOK",
      schema: "PUBLIC",
      tables: ["ALBUM", "ARTIST"],
    });

    const failedFetch = connectService(
      fakeDriver({ checkFetchError: new Error("permission denied") }),
      "session-check-failed",
    );
    await failedFetch.connect({ mode: "profile", profileName: "erd-tool" });
    await assert.rejects(
      failedFetch.reverseEngineer(request("session-check-failed")),
      (error) =>
        error instanceof SnowflakeCheckError &&
        error.code === "SNOWFLAKE_CHECK_LOSS" &&
        error.message.includes("SNOWFLAKE_CHECK_LOSS"),
    );

    const malformed = connectService(
      fakeDriver({
        checkTableConstraints: [checkConstraint("ALBUM", "CK_ALBUM")],
        checkMetadata: [checkConstraintsRow("ALBUM", "CK_ALBUM", "(")],
      }),
      "session-check-malformed",
    );
    await malformed.connect({ mode: "profile", profileName: "erd-tool" });
    await assert.rejects(
      malformed.reverseEngineer(request("session-check-malformed")),
      (error) =>
        error instanceof SnowflakeCheckError &&
        error.code === "SNOWFLAKE_CHECK_INVALID" &&
        error.message.includes("SNOWFLAKE_CHECK_INVALID"),
    );
  });

  it("fails clearly for unsupported identifiers and sanitizes connection errors", async () => {
    const { directory, configPath } = temporaryConfig();
    const service = createSnowflakeService({
      driver: fakeDriver(),
      homeDirectory: directory,
      configPaths: [configPath],
      createId: () => "session-3",
    });
    await service.connect({ mode: "profile", profileName: "erd-tool" });
    await assert.rejects(
      service.reverseEngineer({
        sessionId: "session-3",
        database: "CHINOOK",
        schema: "PUBLIC",
        tables: ["Mixed Case"],
      }),
      /SNOWFLAKE_UNSUPPORTED_IDENTIFIER.*uppercase unquoted/,
    );

    const failing = createSnowflakeService({
      driver: fakeDriver({ connectionError: new Error("password=super-secret\nlogin denied") }),
      homeDirectory: directory,
      configPaths: [configPath],
    });
    await assert.rejects(
      failing.connect({ mode: "profile", profileName: "erd-tool" }),
      (error) =>
        /SNOWFLAKE_CONNECTION_FAILED/.test(error.message) &&
        /password=\[redacted\]/.test(error.message) &&
        !error.message.includes("super-secret") &&
        !error.message.includes("\n"),
    );
  });

  it("executes discrete DDL statements sequentially and sanitizes errors", async () => {
    const { directory, configPath } = temporaryConfig();
    const driver = fakeDriver();
    const service = createSnowflakeService({
      driver,
      homeDirectory: directory,
      configPaths: [configPath],
      createId: () => "session-ddl",
    });
    await service.connect({ mode: "profile", profileName: "erd-tool" });

    const result = await service.executeDdl({
      sessionId: "session-ddl",
      statements: [
        "CREATE DATABASE IF NOT EXISTS TEST_DB;",
        "CREATE SCHEMA IF NOT EXISTS TEST_DB.PUBLIC;",
        "CREATE TABLE IF NOT EXISTS TEST_DB.PUBLIC.T1 (ID NUMBER);",
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.results.length, 3);
    assert.deepEqual(result.results.map((r) => r.ok), [true, true, true]);

    const ddlQueries = driver.observed.queries.filter(({ sqlText }) =>
      sqlText.startsWith("CREATE "),
    );
    assert.equal(ddlQueries.length, 3);

    const failedResult = await service.executeDdl({
      sessionId: "session-ddl",
      statements: ["DROP DATABASE TEST_DB;"],
    });
    assert.equal(failedResult.ok, false);
    assert.equal(failedResult.results[0].ok, false);
    assert.match(failedResult.results[0].error, /Unexpected test query/);

    await assert.rejects(
      service.executeDdl({
        sessionId: "session-ddl",
        statements: "not-an-array",
      }),
      /SNOWFLAKE_INVALID_REQUEST/,
    );
  });
});
