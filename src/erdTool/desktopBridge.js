import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  toSnowflakeIdentifier,
} from "./projectAdapter.js";
import { exportSQL } from "../utils/exportSQL/index.js";

const NATIVE_PROJECT_SAVE_REQUEST = "drawdb:native-project-save-request";
const NATIVE_PROJECT_SAVE_AS_REQUEST = "drawdb:native-project-save-as-request";
const NATIVE_PROJECT_OPEN_REQUEST = "drawdb:native-project-open-request";

function projectFilesApi() {
  return globalThis.window?.drawdbDesktop?.projectFiles ?? null;
}

function ddlExportApi() {
  return globalThis.window?.drawdbDesktop?.ddlExport ?? null;
}

function saveRequest(diagram) {
  const project = diagramToCanonicalProject(diagram);
  let basename = "erd-project";
  try {
    basename = toSnowflakeIdentifier(String(diagram.title || basename));
  } catch {
    // Keep a stable fallback for titles which cannot form an identifier.
  }
  return {
    contents: `${JSON.stringify(project, null, 2)}\n`,
    suggestedName: `${basename}.erd.json`,
  };
}

export function hasDesktopProjectFiles() {
  const api = projectFilesApi();
  return Boolean(api?.open && api?.save && api?.saveAs);
}

export function hasDesktopDdlExport() {
  return typeof ddlExportApi()?.save === "function";
}

export async function exportDesktopSnowflakeDDL(
  diagram,
  generatedContents,
  suggestedBasename,
) {
  const api = ddlExportApi();
  if (typeof api?.save !== "function") {
    throw new Error("Native DDL export is unavailable");
  }
  if (diagram?.database !== "snowflake") {
    throw new Error("Native Snowflake DDL export requires a Snowflake diagram");
  }

  const contents = generatedContents ?? exportSQL(diagram);
  if (typeof contents !== "string" || !contents.trim()) {
    throw new Error("Snowflake export produced empty DDL");
  }

  const basenameSource = String(
    suggestedBasename || diagram.title || "SNOWFLAKE_DDL",
  )
    .trim()
    .replace(/\.sql$/i, "")
    .slice(0, 251);
  let basename = "SNOWFLAKE_DDL";
  try {
    basename = toSnowflakeIdentifier(basenameSource);
  } catch {
    // Keep a stable, portable fallback for invalid or empty file names.
  }
  const result = await api.save({
    contents,
    suggestedName: `${basename}.sql`,
  });
  if (result?.canceled === true) return { canceled: true };
  if (
    result?.canceled !== false ||
    typeof result.filePath !== "string" ||
    !result.filePath
  ) {
    throw new Error("Native DDL export returned an invalid result");
  }
  return { canceled: false, filePath: result.filePath };
}

export function requestDesktopProjectSave() {
  globalThis.window?.dispatchEvent(new Event(NATIVE_PROJECT_SAVE_REQUEST));
}

export function onDesktopProjectSaveRequest(handler) {
  globalThis.window?.addEventListener(NATIVE_PROJECT_SAVE_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      NATIVE_PROJECT_SAVE_REQUEST,
      handler,
    );
}

export function requestDesktopProjectSaveAs() {
  globalThis.window?.dispatchEvent(new Event(NATIVE_PROJECT_SAVE_AS_REQUEST));
}

export function onDesktopProjectSaveAsRequest(handler) {
  globalThis.window?.addEventListener(NATIVE_PROJECT_SAVE_AS_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      NATIVE_PROJECT_SAVE_AS_REQUEST,
      handler,
    );
}

export function requestDesktopProjectOpen() {
  globalThis.window?.dispatchEvent(new Event(NATIVE_PROJECT_OPEN_REQUEST));
}

export function onDesktopProjectOpenRequest(handler) {
  globalThis.window?.addEventListener(NATIVE_PROJECT_OPEN_REQUEST, handler);
  return () =>
    globalThis.window?.removeEventListener(
      NATIVE_PROJECT_OPEN_REQUEST,
      handler,
    );
}

export async function openDesktopProject() {
  const api = projectFilesApi();
  if (!api) throw new Error("Native project files are unavailable");
  const result = await api.open();
  if (result?.canceled) return result;
  return {
    ...result,
    diagram: canonicalProjectToDiagram(JSON.parse(result.contents)),
  };
}

export async function saveDesktopProject(diagram) {
  const api = projectFilesApi();
  if (!api) throw new Error("Native project files are unavailable");
  return api.save(saveRequest(diagram));
}

export async function saveDesktopProjectAs(diagram) {
  const api = projectFilesApi();
  if (!api) throw new Error("Native project files are unavailable");
  return api.saveAs(saveRequest(diagram));
}
