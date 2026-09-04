import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Modal, TextArea, Toast } from "@douyinfe/semi-ui";
import { saveAs } from "file-saver";
import {
  useDiagram,
  useTransform,
  useLayout,
  useNotes,
  useAreas,
  useTypes,
  useEnums,
  useSelect,
  useUndoRedo,
  useSaveState,
} from "../hooks";
import { DB, ObjectType, Tab, Action, State } from "../data/constants";
import { exportSQL } from "../utils/exportSQL";
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  toSnowflakeIdentifier,
} from "../erdTool/projectAdapter";
import { layoutDiagram } from "../erdTool/elkLayout";
import { diagramRevision, deriveNativeChip } from "../erdTool/documentState";
import ConnectionProfilesManager from "./ConnectionProfilesManager";
import SnowflakeReverseEngineer from "./SnowflakeReverseEngineer";
import {
  confirmDesktopUnsavedChanges,
  exportDesktopConnectionDDL,
  hasDesktopSnowflake,
  hasDesktopProjectFiles,
  listDesktopConnections,
  onDesktopAutoArrangeRequest,
  onDesktopConnectionsForwardEngineerRequest,
  onDesktopConnectionsManageRequest,
  onDesktopConnectionsReverseEngineerRequest,
  onDesktopProjectOpenRequest,
  onDesktopProjectSaveAsRequest,
  onDesktopProjectSaveRequest,
  openDesktopProject,
  saveDesktopProject,
  saveDesktopProjectAs,
} from "../erdTool/desktopBridge";

const DEFAULT_SELECTED_ELEMENT = {
  element: ObjectType.NONE,
  id: -1,
  openDialogue: false,
  openCollapse: false,
  currentTab: Tab.TABLES,
  open: false,
  openFromToolbar: false,
};

export default function ErdToolActions({
  title,
  setTitle,
  isNativeDocument,
  onNativeDocumentChange,
  onShowDdl,
  onNativeChipChange,
  onNativeSavingChange,
}) {
  const {
    tables,
    setTables,
    relationships,
    setRelationships,
    database,
    setDatabase,
  } = useDiagram();
  const { transform, setTransform } = useTransform();
  const { layout } = useLayout();
  const { notes, setNotes } = useNotes();
  const { areas, setAreas } = useAreas();
  const { types, setTypes } = useTypes();
  const { enums, setEnums } = useEnums();
  const { setSelectedElement, setBulkSelectedElements } = useSelect();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { saveState, setSaveState } = useSaveState();
  const fileInputRef = useRef(null);
  const saveProjectRef = useRef(null);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [openVisible, setOpenVisible] = useState(false);
  const [projectText, setProjectText] = useState("");
  const [snowflakeVisible, setSnowflakeVisible] = useState(false);
  const [connectionsVisible, setConnectionsVisible] = useState(false);
  const [hasNativeProjectPath, setHasNativeProjectPath] = useState(false);
  const [savedNativeRevision, setSavedNativeRevision] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [nativeSaving, setNativeSaving] = useState(false);
  const desktopProjectFiles = hasDesktopProjectFiles();

  const currentDiagram = () => ({
    database,
    title,
    tables,
    relationships,
    notes,
    areas,
    types,
    enums,
    transform,
  });
  const currentNativeRevision = diagramRevision(currentDiagram());
  const nativeDirty =
    isNativeDocument &&
    savedNativeRevision !== null &&
    currentNativeRevision !== savedNativeRevision;

  const nativeChip = useMemo(
    () =>
      deriveNativeChip({
        dirty: nativeDirty,
        hasPath: hasNativeProjectPath,
        lastSavedAt,
      }),
    [nativeDirty, hasNativeProjectPath, lastSavedAt],
  );

  useEffect(() => {
    onNativeChipChange?.(nativeChip);
  }, [nativeChip, onNativeChipChange]);

  useEffect(() => {
    onNativeSavingChange?.(nativeSaving);
  }, [nativeSaving, onNativeSavingChange]);

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () =>
        reject(reader.error || new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const applyDiagram = (
    diagram,
    {
      native = false,
      unsaved = false,
      modifiedAt = null,
      successMessage = "ERD project loaded",
    } = {},
  ) => {
    if (layout.readOnly) {
      Toast.error("Editor is read-only");
      return false;
    }
    if (native) {
      onNativeDocumentChange();
      setSavedNativeRevision(diagramRevision(diagram));
      setLastSavedAt(
        modifiedAt && !isNaN(new Date(modifiedAt).getTime())
          ? new Date(modifiedAt)
          : null,
      );
    } else if (unsaved && desktopProjectFiles) {
      if (desktopProjectFiles) {
        onNativeDocumentChange();
      }
      setSavedNativeRevision(diagramRevision(diagram));
      setHasNativeProjectPath(false);
      setLastSavedAt(null);
    }
    setDatabase(diagram.database ?? DB.SNOWFLAKE);
    setTitle(diagram.title);
    setTables(diagram.tables);
    setRelationships(diagram.relationships);
    setTransform({
      pan: {
        x: diagram.transform.pan.x,
        y: diagram.transform.pan.y,
      },
      zoom: diagram.transform.zoom,
    });
    setNotes(diagram.notes ?? []);
    setAreas(diagram.areas ?? []);
    setTypes(diagram.types ?? []);
    setEnums(diagram.enums ?? []);
    setSelectedElement({ ...DEFAULT_SELECTED_ELEMENT });
    setBulkSelectedElements([]);
    setUndoStack([]);
    setRedoStack([]);
    setSaveState(State.SAVED);
    setOpenVisible(false);
    setProjectText("");
    Toast.success(successMessage);
    return true;
  };

  const loadProjectText = (text) => {
    try {
      return applyDiagram(canonicalProjectToDiagram(JSON.parse(text)));
    } catch (error) {
      Toast.error(error?.message || "Failed to open ERD project");
      return false;
    }
  };

  const newProject = async () => {
    if (layout.readOnly) {
      Toast.error("Editor is read-only");
      return;
    }
    if (!(await confirmNativeDocumentReplacement())) return;
    const emptyDiagram = {
      database: DB.SNOWFLAKE,
      title: "Untitled ERD Project",
      tables: [],
      relationships: [],
      transform: { pan: { x: 0, y: 0 }, zoom: 1 },
      notes: [],
      areas: [],
      types: [],
      enums: [],
    };
    if (desktopProjectFiles) {
      onNativeDocumentChange();
    }
    applyDiagram(emptyDiagram, {
      unsaved: true,
      successMessage: "New ERD project created",
    });
  };

  const openProject = async () => {
    if (!desktopProjectFiles) {
      setOpenVisible(true);
      return;
    }
    if (layout.readOnly) return;
    if (!(await confirmNativeDocumentReplacement())) return;
    try {
      setNativeSaving(true);
      const result = await openDesktopProject();
      if (
        !result?.canceled &&
        applyDiagram(result.diagram, {
          native: true,
          modifiedAt: result.modifiedAt,
        })
      ) {
        setHasNativeProjectPath(true);
      }
    } catch (error) {
      // Main may have selected a path before canonical renderer validation.
      // Force the next save through Save As so a rejected file is never
      // overwritten by the diagram which remains in the editor.
      setHasNativeProjectPath(false);
      Toast.error(error?.message || "Failed to open ERD project");
    } finally {
      setNativeSaving(false);
    }
  };

  const openProjectFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    if (layout.readOnly) {
      Toast.error("Editor is read-only");
      return;
    }
    try {
      loadProjectText(await readFileAsText(file));
    } catch (error) {
      Toast.error(error?.message || "Failed to read ERD project");
    }
  };

  const saveProject = async () => {
    const diagram = currentDiagram();
    const revision = diagramRevision(diagram);
    const previousSaveState = saveState;
    try {
      if (desktopProjectFiles) {
        setNativeSaving(true);
        setSaveState(State.SAVING);
        const result = hasNativeProjectPath
          ? await saveDesktopProject(diagram)
          : await saveDesktopProjectAs(diagram);
        if (result?.canceled) {
          setSaveState(previousSaveState);
          return false;
        }
        onNativeDocumentChange();
        setHasNativeProjectPath(true);
        setSavedNativeRevision(revision);
        setLastSavedAt(new Date());
        setSaveState(State.SAVED);
        Toast.success("ERD project saved");
        return true;
      }
      const project = diagramToCanonicalProject(currentDiagram());
      const content = `${JSON.stringify(project, null, 2)}\n`;
      const blob = new Blob([content], {
        type: "application/json;charset=utf-8",
      });
      let filename = "erd-project";
      try {
        filename = toSnowflakeIdentifier(String(title || "erd-project"));
      } catch {
        filename = "erd-project";
      }
      saveAs(blob, `${filename}.json`);
      Toast.success("ERD project saved");
      return true;
    } catch (error) {
      if (desktopProjectFiles) {
        setSaveState(State.ERROR);
      }
      Toast.error(error?.message || "Failed to save ERD project");
      return false;
    } finally {
      if (desktopProjectFiles) {
        setNativeSaving(false);
      }
    }
  };

  const confirmNativeDocumentReplacement = async () => {
    if (!desktopProjectFiles || !isNativeDocument) return true;
    if (!nativeDirty) return true;

    const choice = await confirmDesktopUnsavedChanges({ title });
    if (choice === "save") return await saveProject();
    if (choice === "discard") return true;
    return false;
  };

  const saveProjectAs = async () => {
    const diagram = currentDiagram();
    const revision = diagramRevision(diagram);
    const previousSaveState = saveState;
    try {
      setNativeSaving(true);
      setSaveState(State.SAVING);
      const result = await saveDesktopProjectAs(diagram);
      if (!result?.canceled) {
        onNativeDocumentChange();
        setHasNativeProjectPath(true);
        setSavedNativeRevision(revision);
        setLastSavedAt(new Date());
        setSaveState(State.SAVED);
        Toast.success("ERD project saved");
      } else {
        setSaveState(previousSaveState);
      }
    } catch (error) {
      setSaveState(State.ERROR);
      Toast.error(error?.message || "Failed to save ERD project");
    } finally {
      setNativeSaving(false);
    }
  };

  saveProjectRef.current = saveProject;
  useEffect(() => {
    if (!desktopProjectFiles) return undefined;
    return onDesktopProjectSaveRequest(() => {
      void saveProjectRef.current?.();
    });
  }, [desktopProjectFiles]);

  const openProjectRef = useRef(null);
  openProjectRef.current = openProject;
  useEffect(() => {
    if (!desktopProjectFiles) return undefined;
    return onDesktopProjectOpenRequest(() => {
      void openProjectRef.current?.();
    });
  }, [desktopProjectFiles]);

  const saveProjectAsRef = useRef(null);
  saveProjectAsRef.current = saveProjectAs;
  useEffect(() => {
    if (!desktopProjectFiles) return undefined;
    return onDesktopProjectSaveAsRequest(() => {
      void saveProjectAsRef.current?.();
    });
  }, [desktopProjectFiles]);

  const runAutoLayout = async () => {
    if (layout.readOnly) {
      Toast.error("Editor is read-only");
      return;
    }
    if (!tables.length) {
      return;
    }
    setLayoutRunning(true);
    try {
      const nextTables = await layoutDiagram(tables, relationships);
      const changed = nextTables.some((table, index) => {
        const prev = tables[index];
        return !prev || prev.x !== table.x || prev.y !== table.y;
      });
      if (!changed) {
        return;
      }
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.MOVE,
          bulk: true,
          message: "Auto layout",
          elements: tables.map((table, index) => ({
            id: table.id,
            type: ObjectType.TABLE,
            undo: { x: table.x, y: table.y },
            redo: { x: nextTables[index].x, y: nextTables[index].y },
          })),
        },
      ]);
      setRedoStack([]);
      setTables(nextTables);
      setSaveState(State.SAVING);
      Toast.success("Auto layout applied");
    } catch (error) {
      Toast.error(error?.message || "Auto layout failed");
    } finally {
      setLayoutRunning(false);
    }
  };

  const importLiveSnowflakeDiagram = async (diagram) => {
    if (!(await confirmNativeDocumentReplacement())) return false;
    return applyDiagram(diagram, {
      unsaved: true,
      successMessage: "Snowflake schema imported into an editable ERD",
    });
  };

  const reverseEngineerFromConnection = async () => {
    if (layout.readOnly) {
      Toast.error("Editor is read-only");
      return;
    }
    if (database !== DB.SNOWFLAKE) {
      Toast.error("Reverse engineering is currently available for Snowflake connections.");
      return;
    }
    setSnowflakeVisible(true);
  };

  const forwardEngineerToConnection = async () => {
    if (!["snowflake", "sqlite"].includes(database)) {
      Toast.error("Saved connection export supports Snowflake and SQLite diagrams.");
      return;
    }
    try {
      const diagram = currentDiagram();
      const contents = exportSQL(diagram);
      if (!contents.trim()) {
        Toast.error("DDL export produced empty SQL");
        return;
      }
      const profiles = (await listDesktopConnections()).filter(
        (profile) =>
          profile.provider === database &&
          profile.capabilities?.forwardEngineering?.exportDdl,
      );
      if (!profiles.length) {
        setConnectionsVisible(true);
        Toast.error("Add a saved connection before forward engineering.");
        return;
      }
      const selected = profiles[0];
      const result = await exportDesktopConnectionDDL(
        diagram,
        selected.id,
        contents,
        title || selected.name,
      );
      if (!result?.canceled) {
        Toast.success(`DDL exported for ${selected.name}`);
      }
    } catch (error) {
      Toast.error(error?.message || "Forward engineering failed");
    }
  };

  const autoLayoutRef = useRef(null);
  autoLayoutRef.current = runAutoLayout;
  useEffect(() => {
    return onDesktopAutoArrangeRequest(() => {
      void autoLayoutRef.current?.();
    });
  }, []);

  useEffect(() => {
    return onDesktopConnectionsManageRequest(() => {
      setConnectionsVisible(true);
    });
  }, []);

  const reverseFromConnectionRef = useRef(null);
  reverseFromConnectionRef.current = reverseEngineerFromConnection;
  useEffect(() => {
    return onDesktopConnectionsReverseEngineerRequest(() => {
      void reverseFromConnectionRef.current?.();
    });
  }, []);

  const forwardToConnectionRef = useRef(null);
  forwardToConnectionRef.current = forwardEngineerToConnection;
  useEffect(() => {
    return onDesktopConnectionsForwardEngineerRequest(() => {
      void forwardToConnectionRef.current?.();
    });
  }, []);

  useEffect(() => {
    if (!isNativeDocument || (savedNativeRevision !== null && !nativeDirty))
      return;
    if (
      saveState === State.SAVED ||
      saveState === State.NONE ||
      saveState === State.SAVING
    ) {
      setSaveState(State.DIRTY);
    }
  }, [
    isNativeDocument,
    nativeDirty,
    saveState,
    savedNativeRevision,
    setSaveState,
  ]);

  const showDdl = () => {
    onShowDdl?.();
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        style={{ display: "none" }}
        onChange={openProjectFile}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div
        className="flex items-center gap-1"
        role="group"
        aria-label="ERD Tool actions"
      >
        <Button
          data-testid="erd-new-project"
          size="small"
          type="tertiary"
          disabled={layout.readOnly}
          onClick={newProject}
        >
          New ERD Project
        </Button>
        <Button
          data-testid="erd-open-project"
          size="small"
          type="tertiary"
          disabled={layout.readOnly}
          onClick={openProject}
        >
          Open ERD Project
        </Button>
        {desktopProjectFiles && (
          <Button
            data-testid="erd-save-project-as"
            size="small"
            type="tertiary"
            onClick={saveProjectAs}
          >
            Save ERD Project As
          </Button>
        )}
        <Button
          data-testid="erd-save-project"
          size="small"
          type="tertiary"
          onClick={saveProject}
        >
          Save ERD Project
        </Button>
        <Button
          data-testid="erd-auto-layout"
          size="small"
          type="tertiary"
          loading={layoutRunning}
          disabled={layout.readOnly || layoutRunning}
          onClick={runAutoLayout}
        >
          Auto Layout
        </Button>
        <Button
          data-testid="erd-show-ddl"
          size="small"
          type="tertiary"
          onClick={showDdl}
        >
          Snowflake DDL
        </Button>
        {hasDesktopSnowflake() && (
          <Button
            data-testid="erd-reverse-engineer-snowflake"
            size="small"
            type="primary"
            disabled={layout.readOnly}
            onClick={() => setSnowflakeVisible(true)}
          >
            Reverse Engineer Snowflake
          </Button>
        )}
      </div>
      <SnowflakeReverseEngineer
        visible={snowflakeVisible}
        onClose={() => setSnowflakeVisible(false)}
        onImport={importLiveSnowflakeDiagram}
        readOnly={layout.readOnly}
      />
      <ConnectionProfilesManager
        visible={connectionsVisible}
        onClose={() => setConnectionsVisible(false)}
      />
      <Modal
        title="Open ERD Project"
        visible={openVisible}
        onCancel={() => setOpenVisible(false)}
        onOk={() => loadProjectText(projectText)}
        okText="Load Project"
        okButtonProps={{
          disabled: layout.readOnly || !projectText.trim(),
          "data-testid": "erd-load-project-json",
        }}
        width={680}
        centered
      >
        <div className="space-y-3">
          <Button
            disabled={layout.readOnly}
            onClick={() => fileInputRef.current?.click()}
          >
            Choose JSON file
          </Button>
          <div className="text-sm text-gray-500">or paste project JSON</div>
          <TextArea
            data-testid="erd-project-json"
            value={projectText}
            onChange={setProjectText}
            autosize={{ minRows: 8, maxRows: 18 }}
            placeholder="Paste an ERD Tool project here"
          />
        </div>
      </Modal>
    </>
  );
}
