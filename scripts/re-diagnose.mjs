// Diagnose why ERD Tool reverse engineering drops PK/FK constraints.
// Runs the app's REAL main-process service (src/electron/snowflakeService.js)
// against Snowflake and prints row counts + samples for every metadata query,
// then runs the renderer mapper on the result.
//
// Usage (from ~/projects/drawdb, which has node_modules + the CLI key):
//   node scripts/re-diagnose.mjs [profile] [database] [schema]
// Defaults: sf-trial-migrate-target ERD_TOOL_CHINOOK PUBLIC

import { createSnowflakeService } from "../src/electron/snowflakeService.js";
import { snowflakeMetadataToDiagram } from "../src/erdTool/snowflakeMetadata.js";

const [profileName = "sf-trial-migrate-target", database = "ERD_TOOL_CHINOOK", schema = "PUBLIC"] =
  process.argv.slice(2);

const service = createSnowflakeService();
const session = await service.connect({ mode: "profile", profileName });
console.log("connected:", JSON.stringify(session));
const { sessionId } = session;

const tables = await service.listTables(sessionId, database, schema);
const tableNames = tables.filter((t) => t.supported !== false).map((t) => t.name);
console.log(`tables (${tableNames.length}):`, tableNames.join(", "));

const meta = await service.reverseEngineer({ sessionId, database, schema, tables: tableNames });

for (const key of ["schemata", "tables", "columns", "tableConstraints", "keyColumnUsage", "referentialConstraints"]) {
  const rows = meta[key] ?? [];
  console.log(`\n${key}: ${rows.length} rows`);
  if (rows.length) console.log("  sample:", JSON.stringify(rows[0]));
}

const diagram = snowflakeMetadataToDiagram(meta, { title: `${database}.${schema}` });
console.log("\nmapper result:");
console.log("  tables with PK:", diagram.tables.filter((t) => t.fields.some((f) => f.primary)).length, "/", diagram.tables.length);
console.log("  relationships:", diagram.relationships.length);

await service.disconnect(sessionId);
