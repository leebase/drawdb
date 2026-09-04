import { useState, useEffect } from "react";
import { Collapse, Button, Input } from "@douyinfe/semi-ui";
import { IconEyeOpened, IconEyeClosed } from "@douyinfe/semi-icons";
import { IconPlus } from "@douyinfe/semi-icons";
import {
  useSelect,
  useDiagram,
  useSaveState,
  useLayout,
  useUndoRedo,
} from "../../../hooks";
import { Action, ObjectType, State, DB } from "../../../data/constants";
import { useTranslation } from "react-i18next";
import { DragHandle } from "../../SortableList/DragHandle";
import { SortableList } from "../../SortableList/SortableList";
import SearchBar from "./SearchBar";
import Empty from "../Empty";
import TableInfo from "./TableInfo";

function TargetNamespaceEditor({
  targetNamespace,
  updateTargetNamespace,
  readOnly,
}) {
  const [catalog, setCatalog] = useState(targetNamespace?.catalog ?? "MODEL");
  const [schema, setSchema] = useState(targetNamespace?.schema ?? "PUBLIC");

  useEffect(() => {
    setCatalog(targetNamespace?.catalog ?? "MODEL");
    setSchema(targetNamespace?.schema ?? "PUBLIC");
  }, [targetNamespace?.catalog, targetNamespace?.schema]);

  const commit = (nextCat, nextSch) => {
    const cleanCat = (nextCat || "MODEL").trim().toUpperCase();
    const cleanSch = (nextSch || "PUBLIC").trim().toUpperCase();
    updateTargetNamespace({ catalog: cleanCat, schema: cleanSch });
  };

  return (
    <div className="mb-3 p-2 bg-slate-50 dark:bg-zinc-800/60 rounded-md border border-slate-200 dark:border-zinc-700/60">
      <div className="text-xs font-semibold text-slate-600 dark:text-zinc-300 mb-1.5 flex items-center justify-between">
        <span>Target Namespace</span>
        <span className="text-[10px] text-slate-400 font-normal">Snowflake</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-0.5">
            Database
          </label>
          <Input
            size="small"
            value={catalog}
            placeholder="MODEL"
            disabled={readOnly}
            onChange={(val) => setCatalog(val.toUpperCase())}
            onBlur={() => commit(catalog, schema)}
          />
        </div>
        <div>
          <label className="text-[11px] text-slate-500 dark:text-zinc-400 block mb-0.5">
            Schema
          </label>
          <Input
            size="small"
            value={schema}
            placeholder="PUBLIC"
            disabled={readOnly}
            onChange={(val) => setSchema(val.toUpperCase())}
            onBlur={() => commit(catalog, schema)}
          />
        </div>
      </div>
    </div>
  );
}

export default function TablesTab() {
  const {
    tables,
    addTable,
    setTables,
    database,
    targetNamespace,
    updateTargetNamespace,
  } = useDiagram();
  const { selectedElement, setSelectedElement } = useSelect();
  const { t } = useTranslation();
  const { layout } = useLayout();
  const { setSaveState } = useSaveState();

  return (
    <>
      {database === DB.SNOWFLAKE && (
        <TargetNamespaceEditor
          targetNamespace={targetNamespace}
          updateTargetNamespace={updateTargetNamespace}
          readOnly={layout.readOnly}
        />
      )}
      <div className="flex gap-2">
        <SearchBar tables={tables} />
        <div>
          <Button
            block
            icon={<IconPlus />}
            onClick={() => addTable()}
            disabled={layout.readOnly}
          >
            {t("add_table")}
          </Button>
        </div>
      </div>
      {tables.length === 0 ? (
        <Empty title={t("no_tables")} text={t("no_tables_text")} />
      ) : (
        <Collapse
          activeKey={
            selectedElement.open && selectedElement.element === ObjectType.TABLE
              ? `${selectedElement.id}`
              : ""
          }
          keepDOM={false}
          lazyRender
          onChange={(k) =>
            setSelectedElement((prev) => ({
              ...prev,
              open: true,
              id: k[0],
              element: ObjectType.TABLE,
            }))
          }
          accordion
        >
          <SortableList
            keyPrefix="tables-tab"
            items={tables}
            onChange={(newTables) => setTables(newTables)}
            afterChange={() => setSaveState(State.SAVING)}
            renderItem={(item) => <TableListItem table={item} />}
          />
        </Collapse>
      )}
    </>
  );
}

function TableListItem({ table }) {
  const { layout } = useLayout();
  const { updateTable } = useDiagram();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { t } = useTranslation();

  const toggleTableVisibility = (e) => {
    e.stopPropagation();
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "self",
        tid: table.id,
        undo: { hidden: table.hidden },
        redo: { hidden: !table.hidden },
        message: t("edit_table", {
          tableName: table.name,
          extra: "[hidden]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable(table.id, { hidden: !table.hidden });
  };

  return (
    <div id={`scroll_table_${table.id}`}>
      <Collapse.Panel
        className="relative"
        header={
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2 flex-1">
              <DragHandle readOnly={layout.readOnly} id={table.id} />
              <div className="overflow-hidden text-ellipsis whitespace-nowrap">
                {table.name}
              </div>
            </div>
            <Button
              size="small"
              theme="borderless"
              type="tertiary"
              onClick={toggleTableVisibility}
              icon={table.hidden ? <IconEyeClosed /> : <IconEyeOpened />}
              className="me-2"
            />
            <div
              className="w-1 h-full absolute top-0 left-0 bottom-0"
              style={{ backgroundColor: table.color }}
            />
          </div>
        }
        itemKey={`${table.id}`}
      >
        <TableInfo data={table} />
      </Collapse.Panel>
    </div>
  );
}
