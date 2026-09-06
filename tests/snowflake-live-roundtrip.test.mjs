import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSnowflakeService } from "../src/electron/snowflakeService.js";
import { snowflakeMetadataToDiagram } from "../src/erdTool/snowflakeMetadata.js";
import {
  diagramToCanonicalProject,
  renderCanonicalSnowflakeStatements,
} from "../src/erdTool/projectAdapter.js";
import { assertSemanticEqual } from "./wave2a-01-parity.mjs";

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
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.NAME`,
            name: "NAME",
            ordinal: 2,
            data_type: { family: "VARCHAR", text: "VARCHAR(100)", precision: null, scale: null, length: 100, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.IS_ACTIVE`,
            name: "IS_ACTIVE",
            ordinal: 3,
            data_type: { family: "BOOLEAN", text: "BOOLEAN", precision: null, scale: null, length: null, vector_element_type: null, vector_dimension: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.CREATED_AT`,
            name: "CREATED_AT",
            ordinal: 4,
            data_type: { family: "TIMESTAMP_NTZ", text: "TIMESTAMP_NTZ(9)", precision: 9, scale: null, length: null, vector_element_type: null, vector_dimension: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.DEPARTMENT.METADATA`,
            name: "METADATA",
            ordinal: 5,
            data_type: { family: "VARIANT", text: "VARIANT", precision: null, scale: null, length: null, vector_element_type: null, vector_dimension: null },
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
        check_constraints: [
          {
            id: `constraint:${database}.${schema}.DEPARTMENT.CK_DEPT_NAME`,
            name: "CK_DEPT_NAME",
            expression: "LENGTH(NAME) > 0",
            validation: "VALIDATE",
            name_origin: "explicit",
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
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.DEPT_ID`,
            name: "DEPT_ID",
            ordinal: 2,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.FIRST_NAME`,
            name: "FIRST_NAME",
            ordinal: 3,
            data_type: { family: "VARCHAR", text: "VARCHAR(50)", precision: null, scale: null, length: 50, vector_element_type: null, vector_dimension: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.LAST_NAME`,
            name: "LAST_NAME",
            ordinal: 4,
            data_type: { family: "VARCHAR", text: "VARCHAR(50)", precision: null, scale: null, length: 50, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.SALARY`,
            name: "SALARY",
            ordinal: 5,
            data_type: { family: "NUMBER", text: "NUMBER(10, 2)", precision: 10, scale: 2, length: null, vector_element_type: null, vector_dimension: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.HIRE_DATE`,
            name: "HIRE_DATE",
            ordinal: 6,
            data_type: { family: "DATE", text: "DATE", precision: null, scale: null, length: null, vector_element_type: null, vector_dimension: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.PROFILE`,
            name: "PROFILE",
            ordinal: 7,
            data_type: { family: "OBJECT", text: "OBJECT", precision: null, scale: null, length: null, vector_element_type: null, vector_dimension: null },
            nullable: true,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.EMPLOYEE.EMBEDDING`,
            name: "EMBEDDING",
            ordinal: 8,
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
        check_constraints: [
          {
            // Named on purpose: Snowflake assigns system names to unnamed
            // CHECKs, so an unnamed source check can never round-trip by name.
            id: `constraint:${database}.${schema}.EMPLOYEE.CK_EMPLOYEE_SALARY`,
            name: "CK_EMPLOYEE_SALARY",
            expression: "SALARY >= 0",
            validation: "VALIDATE",
            name_origin: "explicit",
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
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.ASSIGNMENT.EMP_ID`,
            name: "EMP_ID",
            ordinal: 2,
            data_type: { family: "NUMBER", text: "NUMBER(38, 0)", precision: 38, scale: 0, length: null, vector_element_type: null, vector_dimension: null },
            nullable: false,
            default: null,
            comment: null,
          },
          {
            id: `column:${database}.${schema}.ASSIGNMENT.ROLE_NAME`,
            name: "ROLE_NAME",
            ordinal: 3,
            data_type: { family: "VARCHAR", text: "VARCHAR(50)", precision: null, scale: null, length: 50, vector_element_type: null, vector_dimension: null },
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
        check_constraints: [],
      },
    ];

    // Ensure all tables and their constraints are sorted by id
    const tables = rawTables
      .map((t) => ({
        ...t,
        constraints: [...t.constraints].sort((a, b) => a.id.localeCompare(b.id)),
        check_constraints: [...(t.check_constraints || [])].sort((a, b) =>
          a.id.localeCompare(b.id),
        ),
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
        model_version: "2",
        name: `${database}.${schema}`,
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

      // 4. Assert model parity. Reverse engineering cannot observe CHECK
      // enforcement or name provenance (INFORMATION_SCHEMA exposes neither),
      // so the metadata mapper records validation UNKNOWN / name_origin
      // unknown by contract. The expected model states that explicitly rather
      // than weakening the parity comparison.
      const expectedAfterReverseEngineering = structuredClone(sourceModel);
      for (const table of expectedAfterReverseEngineering.physical_model.tables) {
        table.check_constraints = table.check_constraints.map((check) => ({
          ...check,
          validation: "UNKNOWN",
          name_origin: "unknown",
        }));
      }
      assertSemanticEqual(
        assert,
        importedProject,
        expectedAfterReverseEngineering,
        "Live reverse-engineered model must have full semantic parity with source model",
      );
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
