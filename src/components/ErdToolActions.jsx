import { useRef, useState } from "react";
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
import {
  canonicalProjectToDiagram,
  diagramToCanonicalProject,
  renderCanonicalSnowflakeDDL,
  toSnowflakeIdentifier,
} from "../erdTool/projectAdapter";
import { layoutDiagram } from "../erdTool/elkLayout";

const DEFAULT_SELECTED_ELEMENT = {
  element: ObjectType.NONE,
  id: -1,
  openDialogue: false,
  openCollapse: false,
  currentTab: Tab.TABLES,
  open: false,
  openFromToolbar: false,
};

export default function ErdToolActions({ title, setTitle }) {
  const {
    tables,
    setTables,
    relationships,
    setRelationships,
    setDatabase,
  } = useDiagram();
  const { transform, setTransform } = useTransform();
  const { layout } = useLayout();
  const { setNotes } = useNotes();
  const { setAreas } = useAreas();
  const { setTypes } = useTypes();
  const { setEnums } = useEnums();
  const { setSelectedElement, setBulkSelectedElements } = useSelect();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSaveState } = useSaveState();
  const fileInputRef = useRef(null);
  const [layoutRunning, setLayoutRunning] = useState(false);
  const [ddlVisible, setDdlVisible] = useState(false);
  const [ddlText, setDdlText] = useState("");
  const [openVisible, setOpenVisible] = useState(false);
  const [projectText, setProjectText] = useState("");

  const readFileAsText = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () =>
        reject(reader.error || new Error("Failed to read file"));
      reader.readAsText(file);
    });

  const loadProjectText = (text) => {
    if (layout.readOnly) {
      Toast.error("Editor is read-only");
      return false;
    }
    let diagram;
    try {
      const project = JSON.parse(text);
      diagram = canonicalProjectToDiagram(project);
    } catch (error) {
      Toast.error(error?.message || "Failed to open ERD project");
      return false;
    }

    setDatabase(DB.SNOWFLAKE);
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
    setNotes([]);
    setAreas([]);
    setTypes([]);
    setEnums([]);
    setSelectedElement({ ...DEFAULT_SELECTED_ELEMENT });
    setBulkSelectedElements([]);
    setUndoStack([]);
    setRedoStack([]);
    setSaveState(State.SAVING);
    setOpenVisible(false);
    setProjectText("");
    Toast.success("ERD project loaded");
    return true;
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

  const saveProject = () => {
    try {
      const project = diagramToCanonicalProject({
        title,
        tables,
        relationships,
        transform,
      });
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
    } catch (error) {
      Toast.error(error?.message || "Failed to save ERD project");
    }
  };

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

  const showDdl = () => {
    try {
      const project = diagramToCanonicalProject({
        title,
        tables,
        relationships,
        transform,
      });
      const ddl = renderCanonicalSnowflakeDDL(project);
      setDdlText(ddl);
      setDdlVisible(true);
    } catch (error) {
      Toast.error(error?.message || "Failed to render Snowflake DDL");
    }
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
          data-testid="erd-open-project"
          size="small"
          type="tertiary"
          disabled={layout.readOnly}
          onClick={() => {
            if (layout.readOnly) return;
            setOpenVisible(true);
          }}
        >
          Open ERD Project
        </Button>
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
      </div>
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
      <Modal
        title="Snowflake DDL (PK/FK informational)"
        visible={ddlVisible}
        onCancel={() => setDdlVisible(false)}
        onOk={() => setDdlVisible(false)}
        okText="Close"
        cancelButtonProps={{ style: { display: "none" } }}
        width={720}
        centered
      >
        <pre
          data-testid="erd-ddl-output"
          className="max-h-[60vh] overflow-auto whitespace-pre-wrap break-words text-sm"
        >
          {ddlText}
        </pre>
      </Modal>
    </>
  );
}
