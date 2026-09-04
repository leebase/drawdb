import { useState, useRef } from "react";
import {
  Collapse,
  Input,
  TextArea,
  Button,
  Card,
  Select,
  Dropdown,
} from "@douyinfe/semi-ui";
import ColorPicker from "../ColorPicker";
import { IconDeleteStroked, IconPlus } from "@douyinfe/semi-icons";
import {
  useDiagram,
  useLayout,
  useSaveState,
  useUndoRedo,
} from "../../../hooks";
import { Action, ObjectType, State, DB } from "../../../data/constants";
import TableField from "./TableField";
import IndexDetails from "./IndexDetails";
import UniqueConstraintDetails from "./UniqueConstraintDetails";
import CheckConstraintDetails, {
  readSnowflakeTableChecks,
} from "./CheckConstraintDetails";
import { useTranslation } from "react-i18next";
import { SortableList } from "../../SortableList/SortableList";
import { nanoid } from "nanoid";

function nextSnowflakeCheckName(table, checks) {
  const occupied = new Set(
    checks.map((check) => String(check.name).trim().toUpperCase()),
  );
  for (const constraint of table.constraints ?? []) {
    if (String(constraint.kind ?? "").toLowerCase() !== "check") {
      occupied.add(String(constraint.name ?? "").trim().toUpperCase());
    }
  }
  for (const constraint of table.uniqueConstraints ?? []) {
    occupied.add(String(constraint.name ?? "").trim().toUpperCase());
  }
  occupied.add(String(table.constraintView?.primaryKeyName ?? "").trim().toUpperCase());
  for (const name of Object.values(table.constraintView?.uniqueNames ?? {})) {
    occupied.add(String(name).trim().toUpperCase());
  }

  const tableToken =
    String(table.name ?? "TABLE")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_$]/g, "_") || "TABLE";
  const base = `CK_${tableToken}`;
  for (let ordinal = 1; ; ordinal += 1) {
    const suffix = `_${ordinal}`;
    const candidate = `${base.slice(0, 255 - suffix.length)}${suffix}`;
    if (!occupied.has(candidate)) return candidate;
  }
}

export default function TableInfo({ data }) {
  const { tables, database } = useDiagram();
  const { t } = useTranslation();
  const [indexActiveKey, setIndexActiveKey] = useState("");
  const [uniqueActiveKey, setUniqueActiveKey] = useState("");
  const [checkActiveKey, setCheckActiveKey] = useState("1");
  const [draftCheck, setDraftCheck] = useState(null);
  const [commentActiveKey, setCommentActiveKey] = useState("");
  const [showComment, setShowComment] = useState(false);
  const { layout } = useLayout();
  const { deleteTable, updateTable, setTables } = useDiagram();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { setSaveState } = useSaveState();
  const [editField, setEditField] = useState({});
  const initialColorRef = useRef(data.color);
  const snowflakeCheckState =
    database === DB.SNOWFLAKE
      ? readSnowflakeTableChecks(data)
      : { checks: [], error: null };
  const { checks: snowflakeChecks, error: snowflakeCheckError } =
    snowflakeCheckState;
  // A malformed CHECK representation remains present in the source table and
  // must fail closed for structural actions.  Keep the panel visible with the
  // typed error rather than treating the table as CHECK-free.
  const hasSnowflakeChecks =
    snowflakeChecks.length > 0 || Boolean(snowflakeCheckError);

  const addCheckConstraint = () => {
    if (layout.readOnly || draftCheck) return;
    setDraftCheck({
      id: nanoid(),
      name: nextSnowflakeCheckName(data, snowflakeChecks),
      expression: "",
    });
    setCheckActiveKey("1");
  };

  const handleColorPick = (color) => {
    setUndoStack((prev) => {
      let undoColor = initialColorRef.current;
      const lastColorChange = prev.findLast(
        (e) =>
          e.element === ObjectType.TABLE &&
          e.tid === data.id &&
          e.action === Action.EDIT &&
          e.redo?.color,
      );
      if (lastColorChange) {
        undoColor = lastColorChange.redo.color;
      }

      if (color === undoColor) return prev;

      const newStack = [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "self",
          tid: data.id,
          undo: { color: undoColor },
          redo: { color: color },
          message: t("edit_table", {
            tableName: data.name,
            extra: "[color]",
          }),
        },
      ];
      return newStack;
    });
    setRedoStack([]);
  };

  const inheritedFieldNames =
    Array.isArray(data.inherits) && data.inherits.length > 0
      ? data.inherits
          .map((parentName) => {
            const parent = tables.find((t) => t.name === parentName);
            return parent ? parent.fields.map((f) => f.name) : [];
          })
          .flat()
      : [];

  const addIndex = () => {
    setIndexActiveKey("1");
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "index_add",
        tid: data.id,
        message: t("edit_table", {
          tableName: data.name,
          extra: "[add index]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable(data.id, {
      indices: [
        ...data.indices,
        {
          id: data.indices.length,
          name: `${data.name}_index_${data.indices.length}`,
          unique: false,
          fields: [],
        },
      ],
    });
  };

  const addUniqueConstraint = () => {
    setUniqueActiveKey("1");
    const constraints = data.uniqueConstraints || [];
    setUndoStack((prev) => [
      ...prev,
      {
        action: Action.EDIT,
        element: ObjectType.TABLE,
        component: "unique_constraint_add",
        tid: data.id,
        message: t("edit_table", {
          tableName: data.name,
          extra: "[add unique constraint]",
        }),
      },
    ]);
    setRedoStack([]);
    updateTable(data.id, {
      uniqueConstraints: [
        ...constraints,
        {
          id: constraints.length,
          name: `${data.name}_unique_${constraints.length}`,
          fields: [],
        },
      ],
    });
  };

  const addComment = () => {
    setShowComment(true);
    setCommentActiveKey("1");
  };

  return (
    <div>
      <div className="flex items-center mb-2.5">
        <div className="text-md font-semibold break-keep">{t("name")}:</div>
        <Input
          value={data.name}
          validateStatus={data.name.trim() === "" ? "error" : "default"}
          placeholder={t("name")}
          className="ms-2"
          readonly={layout.readOnly}
          disabled={hasSnowflakeChecks}
          title={
            hasSnowflakeChecks
              ? "Remove or revise CHECK constraints before renaming this table"
              : t("name")
          }
          onChange={(value) => updateTable(data.id, { name: value })}
          onFocus={(e) => setEditField({ name: e.target.value })}
          onBlur={(e) => {
            if (e.target.value === editField.name) return;
            setUndoStack((prev) => [
              ...prev,
              {
                action: Action.EDIT,
                element: ObjectType.TABLE,
                component: "self",
                tid: data.id,
                undo: editField,
                redo: { name: e.target.value },
                message: t("edit_table", {
                  tableName: e.target.value,
                  extra: "[name]",
                }),
              },
            ]);
            setRedoStack([]);
          }}
        />
      </div>

      <SortableList
        items={data.fields}
        keyPrefix={`table-${data.id}`}
        onChange={(newFields) =>
          setTables((prev) =>
            prev.map((t) =>
              t.id === data.id ? { ...t, fields: newFields } : t,
            ),
          )
        }
        afterChange={() => setSaveState(State.SAVING)}
        renderItem={(item, i) => (
          <TableField
            data={item}
            tid={data.id}
            index={i}
            inherited={inheritedFieldNames.includes(item.name)}
          />
        )}
      />

      {database === DB.POSTGRES && (
        <div className="mb-2">
          <div className="text-md font-semibold break-keep">
            {t("inherits")}:
          </div>
          <Select
            multiple
            value={data.inherits || []}
            optionList={tables
              .filter((t) => t.id !== data.id)
              .map((t) => ({ label: t.name, value: t.name }))}
            onChange={(value) => {
              if (layout.readOnly) return;

              setUndoStack((prev) => [
                ...prev,
                {
                  action: Action.EDIT,
                  element: ObjectType.TABLE,
                  component: "self",
                  tid: data.id,
                  undo: { inherits: data.inherits },
                  redo: { inherits: value },
                  message: t("edit_table", {
                    tableName: data.name,
                    extra: "[inherits]",
                  }),
                },
              ]);
              setRedoStack([]);
              updateTable(data.id, { inherits: value });
            }}
            placeholder={t("inherits")}
            className="w-full"
          />
        </div>
      )}

      {data.indices.length > 0 && (
        <Card
          bodyStyle={{ padding: "4px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
        >
          <Collapse
            activeKey={indexActiveKey}
            keepDOM={false}
            lazyRender
            onChange={(itemKey) => setIndexActiveKey(itemKey)}
            accordion
          >
            <Collapse.Panel header={t("indices")} itemKey="1">
              {data.indices.map((idx, k) => (
                <IndexDetails
                  key={"index_" + k}
                  data={idx}
                  iid={k}
                  tid={data.id}
                  fields={data.fields.map((e) => ({
                    value: e.name,
                    label: e.name,
                  }))}
                />
              ))}
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      {(data.uniqueConstraints || []).length > 0 && (
        <Card
          bodyStyle={{ padding: "4px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
        >
          <Collapse
            activeKey={uniqueActiveKey}
            keepDOM={false}
            lazyRender
            onChange={(itemKey) => setUniqueActiveKey(itemKey)}
            accordion
          >
            <Collapse.Panel header={t("unique_constraints")} itemKey="1">
              {data.uniqueConstraints.map((uc, k) => (
                <UniqueConstraintDetails
                  key={"unique_constraint_" + k}
                  data={uc}
                  cid={k}
                  tid={data.id}
                  fields={data.fields.map((e) => ({
                    value: e.name,
                    label: e.name,
                  }))}
                />
              ))}
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      {database === DB.SNOWFLAKE && (hasSnowflakeChecks || draftCheck) && (
        <Card
          bodyStyle={{ padding: "8px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
          data-testid="snowflake-check-constraints"
        >
          <Collapse
            activeKey={checkActiveKey}
            keepDOM
            onChange={(itemKey) => setCheckActiveKey(itemKey)}
            accordion
          >
            <Collapse.Panel header="CHECK constraints" itemKey="1">
              {snowflakeCheckError ? (
                <div
                  className="text-xs text-red-600"
                  role="alert"
                  data-testid="snowflake-check-error"
                >
                  CHECK constraints could not be validated: {snowflakeCheckError.message}
                </div>
              ) : (
                <>
                  {snowflakeChecks.map((check) => (
                    <CheckConstraintDetails
                      key={`check_constraint_${check.id}`}
                      data={check}
                      tid={data.id}
                    />
                  ))}
                  {draftCheck && (
                    <CheckConstraintDetails
                      key={`check_constraint_draft_${draftCheck.id}`}
                      data={draftCheck}
                      tid={data.id}
                      isDraft
                      onCanceled={() => setDraftCheck(null)}
                      onCommitted={() => setDraftCheck(null)}
                    />
                  )}
                </>
              )}
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      {((data.comment && data.comment.trim() !== "") || showComment) && (
        <Card
          bodyStyle={{ padding: "4px" }}
          style={{ marginTop: "12px", marginBottom: "12px" }}
          headerLine={false}
        >
          <Collapse
            activeKey={commentActiveKey}
            onChange={(itemKey) => setCommentActiveKey(itemKey)}
            keepDOM={false}
            lazyRender
            accordion
          >
            <Collapse.Panel header={t("comment")} itemKey="1">
              <TextArea
                field="comment"
              value={data.comment}
              readonly={layout.readOnly}
              autosize
              placeholder={t("comment")}
              rows={1}
              onChange={(value) =>
                updateTable(data.id, { comment: value }, false)
              }
              onFocus={(e) => setEditField({ comment: e.target.value })}
              onBlur={(e) => {
                if (e.target.value === editField.comment) return;
                setUndoStack((prev) => [
                  ...prev,
                  {
                    action: Action.EDIT,
                    element: ObjectType.TABLE,
                    component: "self",
                    tid: data.id,
                    undo: editField,
                    redo: { comment: e.target.value },
                    message: t("edit_table", {
                      tableName: e.target.value,
                      extra: "[comment]",
                    }),
                  },
                ]);
                setRedoStack([]);
              }}
              />
            </Collapse.Panel>
          </Collapse>
        </Card>
      )}

      <div className="flex justify-between items-center gap-1 mt-5 mb-2">
        <ColorPicker
          usePopover={true}
          readOnly={layout.readOnly}
          value={data.color}
          onChange={(color) => updateTable(data.id, { color })}
          onColorPick={(color) => handleColorPick(color)}
        />
        <div className="flex gap-1">
          <Dropdown
            position="bottomLeft"
            trigger="click"
            render={
              <Dropdown.Menu>
                <Dropdown.Item onClick={addComment}>
                  {t("add_comment")}
                </Dropdown.Item>
                <Dropdown.Item onClick={addUniqueConstraint}>
                  {t("add_unique_constraint")}
                </Dropdown.Item>
                {database === DB.SNOWFLAKE && (
                  <Dropdown.Item onClick={addCheckConstraint}>
                    Add CHECK constraint
                  </Dropdown.Item>
                )}
                <Dropdown.Item onClick={addIndex}>
                  {t("add_index")}
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Button
              icon={<IconPlus />}
              disabled={layout.readOnly}
              title={t("add")}
            />
          </Dropdown>
          <Button
            block
            disabled={layout.readOnly}
            onClick={() => {
              const id = nanoid();
              setUndoStack((prev) => [
                ...prev,
                {
                  action: Action.EDIT,
                  element: ObjectType.TABLE,
                  component: "field_add",
                  tid: data.id,
                  fid: id,
                  message: t("edit_table", {
                    tableName: data.name,
                    extra: "[add field]",
                  }),
                },
              ]);
              setRedoStack([]);
              updateTable(data.id, {
                fields: [
                  ...data.fields,
                  {
                    id,
                    name: "",
                    type: "",
                    default: "",
                    check: "",
                    primary: false,
                    unique: false,
                    notNull: false,
                    increment: false,
                    comment: "",
                  },
                ],
              });
            }}
          >
            {t("add_field")}
          </Button>
          {database === DB.SNOWFLAKE && (
            <Button
              disabled={
                layout.readOnly || Boolean(draftCheck) || Boolean(snowflakeCheckError)
              }
              onClick={addCheckConstraint}
              data-testid="snowflake-add-check-constraint"
              title={draftCheck ? "Finish the current CHECK draft first" : "Add CHECK constraint"}
            >
              Add CHECK
            </Button>
          )}
          <Button
            type="danger"
            disabled={layout.readOnly || hasSnowflakeChecks}
            icon={<IconDeleteStroked />}
            title={
              hasSnowflakeChecks
                ? "Remove or revise CHECK constraints before deleting this table"
                : t("delete")
            }
            onClick={() => deleteTable(data.id)}
          />
        </div>
      </div>
    </div>
  );
}
