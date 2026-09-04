import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSnowflakeService } from "../src/electron/snowflakeService.js";
import { snowflakeMetadataToDiagram } from "../src/erdTool/snowflakeMetadata.js";
import {
  diagramToCanonicalProject,
  renderCanonicalSnowflakeStatements,
} from "../src/erdTool/projectAdapter.js";

const LIVE_PROFILE = process.env.ERD_TOOL_LIVE_PROFILE;

describe("S4-01 Live Snowflake Round-Trip Harness", () => {
  it("deploys schema, reverse engineers, verifies model parity, and drops schema", async (t) => {
    if (!LIVE_PROFILE) {
      t.skip(
        "Set ERD_TOOL_LIVE_PROFILE=<profile_name> (e.g. msigasi_leebase) to execute live Snowflake test.",
      );
      return;
    }

    const service = createSnowflakeService();
    const profiles = service.listProfiles();
    const targetProfile = profiles.find((p) => p.name === LIVE_PROFILE);
    assert.ok(
      targetProfile,
      `Configured profile '${LIVE_PROFILE}' was not discovered in ~/.snowflake/config.toml`,
    );

    const connection = await service.connect({
      mode: "profile",
      profileName: LIVE_PROFILE,
    });
    assert.ok(connection?.sessionId, "Must establish a valid Snowflake session");
    const sessionId = connection.sessionId;

    const database = "ERD_TOOL_CHINOOK";
    const runId = Date.now().toString(36).toUpperCase();
    const schema = `QA_ROUNDTRIP_${runId}`;

    const rawTables = [
      {
        id: `table:${database}.${schema}.DEPARTMENT`,
        namespace_id: `namespace:${database}.${schema}`,
        name: "DEPARTMENT",
        kind: "table",
        comment: "Department catalog",
        columns: [
          {
            id: `column:${database}.${schema}.DEPARTMENT.DEPT_ID`,
            name: "DEPT_ID",
            ordinal: 1,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.NAME`,
            name: "NAME",
            ordinal: 2,
            data_type: { family: "VARCHAR", text: "VARCHAR(100)", precision: null, scale: null, length: 100 },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.IS_ACTIVE`,
            name: "IS_ACTIVE",
            ordinal: 3,
            data_type: { family: "BOOLEAN", text: "BOOLEAN", precision: null, scale: null, length: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.CREATED_AT`,
            name: "CREATED_AT",
            ordinal: 4,
            data_type: { family: "TIMESTAMP_NTZ", text: "TIMESTAMP_NTZ(9)", precision: 9, scale: null, length: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.METADATA`,
            name: "METADATA",
            ordinal: 5,
            data_type: { family: "VARIANT", text: "VARIANT", precision: null, scale: null, length: null },
            nullable: true,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: `constraint:${database}.${schema}.DEPARTMENT.PK_DEPARTMENT`,
            name: "PK_DEPARTMENT",
            kind: "primary_key",
            columns: [`column:${database}.${schema}.DEPARTMENT.DEPT_ID`],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
      },
      {
        id: `table:${database}.${schema}.EMPLOYEE`,
        namespace_id: `namespace:${database}.${schema}`,
        name: "EMPLOYEE",
        kind: "table",
        comment: "Employee directory",
        columns: [
          {
            id: `column:${database}.${schema}.EMPLOYEE.EMP_ID`,
            name: "EMP_ID",
            ordinal: 1,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.DEPT_ID`,
            name: "DEPT_ID",
            ordinal: 2,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.FIRST_NAME`,
            name: "FIRST_NAME",
            ordinal: 3,
            data_type: { family: "VARCHAR", text: "VARCHAR(50)", precision: null, scale: null, length: 50 },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.LAST_NAME`,
            name: "LAST_NAME",
            ordinal: 4,
            data_type: { family: "VARCHAR", text: "VARCHAR(50)", precision: null, scale: null, length: 50 },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.SALARY`,
            name: "SALARY",
            ordinal: 5,
            data_type: { family: "NUMBER", text: "NUMBER(10, 2)", precision: 10, scale: 2, length: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.HIRE_DATE`,
            name: "HIRE_DATE",
            ordinal: 6,
            data_type: { family: "DATE", text: "DATE", precision: null, scale: null, length: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.PROFILE`,
            name: "PROFILE",
            ordinal: 7,
            data_type: { family: "OBJECT", text: "OBJECT", precision: null, scale: null, length: null },
            nullable: true,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: `constraint:${database}.${schema}.EMPLOYEE.FK_EMP_DEPT`,
            name: "FK_EMP_DEPT",
            kind: "foreign_key",
            columns: [`column:${database}.${schema}.EMPLOYEE.DEPT_ID`],
            referenced_table_id: `table:${database}.${schema}.DEPARTMENT`,
            referenced_columns: [`column:${database}.${schema}.DEPARTMENT.DEPT_ID`],
          },
          {
            id: `constraint:${database}.${schema}.EMPLOYEE.PK_EMPLOYEE`,
            name: "PK_EMPLOYEE",
            kind: "primary_key",
            columns: [`column:${database}.${schema}.EMPLOYEE.EMP_ID`],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
      },
      {
        id: `table:${database}.${schema}.ASSIGNMENT`,
        namespace_id: `namespace:${database}.${schema}`,
        name: "ASSIGNMENT",
        kind: "table",
        comment: "Project staff assignment",
        columns: [
          {
            id: `column:${database}.${schema}.ASSIGNMENT.PROJECT_ID`,
            name: "PROJECT_ID",
            ordinal: 1,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.ASSIGNMENT.EMP_ID`,
            name: "EMP_ID",
            ordinal: 2,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.ASSIGNMENT.ROLE_NAME`,
            name: "ROLE_NAME",
            ordinal: 3,
            data_type: { family: "VARCHAR", text: "VARCHAR(50)", precision: null, scale: null, length: 50 },
            nullable: false,
            default: null,
            comment: null,
          },
        ],
        constraints: [
          {
            id: `constraint:${database}.${schema}.ASSIGNMENT.FK_ASSIGN_EMP`,
            name: "FK_ASSIGN_EMP",
            kind: "foreign_key",
            columns: [`column:${database}.${schema}.ASSIGNMENT.EMP_ID`],
            referenced_table_id: `table:${database}.${schema}.EMPLOYEE`,
            referenced_columns: [`column:${database}.${schema}.EMPLOYEE.EMP_ID`],
          },
          {
            id: `constraint:${database}.${schema}.ASSIGNMENT.PK_ASSIGNMENT`,
            name: "PK_ASSIGNMENT",
            kind: "primary_key",
            columns: [
              `column:${database}.${schema}.ASSIGNMENT.PROJECT_ID`,
              `column:${database}.${schema}.ASSIGNMENT.EMP_ID`,
            ],
            referenced_table_id: null,
            referenced_columns: [],
          },
        ],
      },
    ];

    // Ensure all tables and their constraints are sorted by id
    const tables = rawTables
      .map((t) => ({
        ...t,
        constraints: [...t.constraints].sort((a, b) => a.id.localeCompare(b.id)),
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    const rawRelationships = [
      {
        id: `relationship:${database}.${schema}.EMPLOYEE.FK_EMP_DEPT`,
        name: "FK_EMP_DEPT",
        source_table_id: `table:${database}.${schema}.EMPLOYEE`,
        source_column_ids: [`column:${database}.${schema}.EMPLOYEE.DEPT_ID`],
        target_table_id: `table:${database}.${schema}.DEPARTMENT`,
        target_column_ids: [`column:${database}.${schema}.DEPARTMENT.DEPT_ID`],
        cardinality: "many_to_one",
      },
      {
        id: `relationship:${database}.${schema}.ASSIGNMENT.FK_ASSIGN_EMP`,
        name: "FK_ASSIGN_EMP",
        source_table_id: `table:${database}.${schema}.ASSIGNMENT`,
        source_column_ids: [`column:${database}.${schema}.ASSIGNMENT.EMP_ID`],
        target_table_id: `table:${database}.${schema}.EMPLOYEE`,
        target_column_ids: [`column:${database}.${schema}.EMPLOYEE.EMP_ID`],
        cardinality: "many_to_one",
      },
    ];

    const relationships = rawRelationships.sort((a, b) => a.id.localeCompare(b.id));

    const sourceModel = {
      project_version: "1",
      physical_model: {
        model_version: "1",
        name: `qa-model-${runId}`,
        namespaces: [
          {
            id: `namespace:${database}.${schema}`,
            catalog: database,
            schema: schema,
          },
        ],
        tables,
        relationships,
      },
      diagram_layout: {
        nodes: {},
        viewport: { x: 0, y: 0, zoom: 1 },
      },
    };

    const ddlStatements = renderCanonicalSnowflakeStatements(sourceModel, {
      databaseOverride: database,
      schemaOverride: schema,
    });

    try {
      // 1. Deploy DDL to Snowflake
      const deployResult = await service.executeDdl({
        sessionId,
        statements: ddlStatements,
      });

      assert.equal(
        deployResult.ok,
        true,
        `DDL execution failed: ${deployResult.results.find((r) => !r.ok)?.error}`,
      );
      assert.equal(deployResult.results.length, ddlStatements.length);

      // 2. Reverse engineer live metadata from the deployed schema
      const tablesList = ["DEPARTMENT", "EMPLOYEE", "ASSIGNMENT"];
      const rawMetadata = await service.reverseEngineer({
        sessionId,
        database,
        schema,
        tables: tablesList,
      });

      assert.equal(rawMetadata.tables.length, 3);
      assert.equal(rawMetadata.referentialConstraints.length, 2);

      // 3. Convert reverse engineered metadata back into a canonical physical model
      const importedDiagram = snowflakeMetadataToDiagram(rawMetadata, {
        title: `${database}.${schema}`,
      });
      const importedProject = diagramToCanonicalProject(importedDiagram);
      const importedModel = importedProject.physical_model;

      // 4. Assert model parity
      const importedTableNames = importedModel.tables.map((t) => t.name).sort();
      assert.deepEqual(importedTableNames, ["ASSIGNMENT", "DEPARTMENT", "EMPLOYEE"]);

      // Verify DEPARTMENT columns and types
      const deptTable = importedModel.tables.find((t) => t.name === "DEPARTMENT");
      assert.ok(deptTable);
      const deptColFamilies = deptTable.columns.map((c) => `${c.name}:${c.data_type.family}`);
      assert.deepEqual(deptColFamilies, [
        "DEPT_ID:NUMBER",
        "NAME:VARCHAR",
        "IS_ACTIVE:BOOLEAN",
        "CREATED_AT:TIMESTAMP_NTZ",
        "METADATA:VARIANT",
      ]);

      // Verify EMPLOYEE columns and types
      const empTable = importedModel.tables.find((t) => t.name === "EMPLOYEE");
      assert.ok(empTable);
      const empColFamilies = empTable.columns.map((c) => `${c.name}:${c.data_type.family}`);
      assert.deepEqual(empColFamilies, [
        "EMP_ID:NUMBER",
        "DEPT_ID:NUMBER",
        "FIRST_NAME:VARCHAR",
        "LAST_NAME:VARCHAR",
        "SALARY:NUMBER",
        "HIRE_DATE:DATE",
        "PROFILE:OBJECT",
      ]);

      // Verify relationships
      assert.equal(importedModel.relationships.length, 2);
      const relNames = importedModel.relationships.map((r) => r.name).sort();
      assert.deepEqual(relNames, ["FK_ASSIGN_EMP", "FK_EMP_DEPT"]);
    } finally {
      // 5. Tear down temporary test schema and disconnect
      try {
        await service.executeDdl({
          sessionId,
          statements: [`DROP SCHEMA IF EXISTS ${database}.${schema};`],
        });
      } catch (cleanupError) {
        console.warn(`Could not drop temporary schema ${database}.${schema}:`, cleanupError);
      }
      await service.disconnect(sessionId);
    }
  });
});
