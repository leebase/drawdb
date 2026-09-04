import { DB } from "../../data/constants.js";
import { toMariaDB } from "./mariadb.js";
import { toMSSQL } from "./mssql.js";
import { toMySQL } from "./mysql.js";
import { toOracleSQL } from "./oraclesql.js";
import { toPostgres } from "./postgres.js";
import { toSqlite } from "./sqlite.js";
import {
  diagramToCanonicalProject,
  renderCanonicalSnowflakeDDL,
  SnowflakeCheckError,
} from "../../erdTool/projectAdapter.js";

export function exportSQL(diagram) {
  if (
    diagram.database !== DB.SNOWFLAKE &&
    diagram.tables?.some((table) => table.checkConstraints?.length)
  ) {
    throw new SnowflakeCheckError(
      "SNOWFLAKE_CHECK_UNSUPPORTED",
      "This SQL dialect cannot preserve table CHECK constraints. Export as Snowflake DDL or a canonical project.",
    );
  }
  switch (diagram.database) {
    case DB.SQLITE:
      return toSqlite(diagram);
    case DB.MYSQL:
      return toMySQL(diagram);
    case DB.POSTGRES:
      return toPostgres(diagram);
    case DB.MARIADB:
      return toMariaDB(diagram);
    case DB.MSSQL:
      return toMSSQL(diagram);
    case DB.ORACLESQL:
      return toOracleSQL(diagram);
    case DB.SNOWFLAKE:
      return renderCanonicalSnowflakeDDL(diagramToCanonicalProject(diagram));
    default:
      return "";
  }
}
