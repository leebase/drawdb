import { parseSnowflakeDDLToDiagram } from "../../erdTool/projectAdapter.js";

export function fromSnowflake(sql, options = {}) {
  return parseSnowflakeDDLToDiagram(sql, options);
}
