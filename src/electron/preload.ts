import { contextBridge, ipcRenderer } from "electron";

type SaveResult =
  | { canceled: true }
  | { canceled: false; filePath: string };

const projectFiles = Object.freeze({
  open: () => ipcRenderer.invoke("project:open"),
  save: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("project:save", request),
  saveAs: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("project:save-as", request),
});

const ddlExport = Object.freeze({
  save: (request: { contents: string; suggestedName: string }) =>
    ipcRenderer.invoke("ddl:export", request) as Promise<SaveResult>,
});

contextBridge.exposeInMainWorld(
  "drawdbDesktop",
  Object.freeze({ runtimeVersion: 1, projectFiles, ddlExport }),
);
