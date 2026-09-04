import { createContext, useCallback, useState } from "react";
import { Action, DB, ObjectType, defaultBlue } from "../data/constants";
import { useTransform, useUndoRedo, useSelect, useCollab } from "../hooks";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { getRelationshipFields } from "../utils/utils";
import {
  SnowflakeCheckError,
  getSnowflakeTableChecks,
} from "../erdTool/projectAdapter.js";

export const DiagramContext = createContext(null);

function normalizedFieldType(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase();
}

function normalizedFieldSize(value) {
  return String(value ?? "").trim();
}

function namespaceKey(namespace) {
  return `${namespace?.catalog ?? ""}.${namespace?.schema ?? ""}`;
}

export default function DiagramContextProvider({ children }) {
  const { t } = useTranslation();
  const [database, setDatabaseRaw] = useState(DB.GENERIC);
  const [tables, setTables] = useState([]);
  const [relationships, setRelationships] = useState([]);
  const { transform } = useTransform();
  const { setUndoStack, setRedoStack } = useUndoRedo();
  const { selectedElement, setSelectedElement } = useSelect();
  const { emitDelta, isApplyingRemoteRef } = useCollab();

  const shouldEmit = () => !isApplyingRemoteRef?.current;

  // CHECK predicates are opaque SQL.  Once a Snowflake table has one, a
  // structural edit cannot be proven safe because the predicate may reference
  // any column (or the table itself).  Return the typed error instead of
  // mutating state; callers can therefore surface the error without creating
  // a partial history/collaboration update.  `getSnowflakeTableChecks` also
  // recognizes legacy field.check values, so old diagrams receive the same
  // protection until their checks are explicitly migrated/removed.
  const snowflakeCheckError = (code, message) => {
    const error = new SnowflakeCheckError(code, message);
    Toast.error(error.message);
    return error;
  };

  const inspectSnowflakeChecks = (table) => {
    if (database !== DB.SNOWFLAKE) return { hasChecks: false, error: null };
    try {
      return {
        hasChecks: getSnowflakeTableChecks(table).length > 0,
        error: null,
      };
    } catch (error) {
      // Imported documents can contain malformed CHECK metadata even when the
      // outer .ddb shape validated.  Treat it as CHECK-bearing for structural
      // guards, while preserving a typed error for the attempted mutation.
      const typedError =
        error?.name === "SnowflakeCheckError" && error?.code
          ? error
          : new SnowflakeCheckError(
              "SNOWFLAKE_CHECK_INVALID",
              error?.message || "CHECK metadata could not be validated.",
            );
      return { hasChecks: true, error: typedError };
    }
  };

  const checkGuardError = (table, checkState, structuralMessage) =>
    checkState.error
      ? snowflakeCheckError(
          checkState.error.code || "SNOWFLAKE_CHECK_INVALID",
          `Table ${table.name} has CHECK metadata that could not be validated. ${structuralMessage} ${checkState.error.message}`,
        )
      : snowflakeCheckError(
          "SNOWFLAKE_CHECK_STRUCTURAL_EDIT",
          structuralMessage,
        );

  const guardTableUpdate = (id, updatedValues) => {
    const table = tables.find((candidate) => candidate.id === id);
    const checkState = table && inspectSnowflakeChecks(table);
    if (!table || !checkState?.hasChecks) return null;

    if (
      Object.prototype.hasOwnProperty.call(updatedValues, "name") &&
      updatedValues.name !== table.name
    ) {
      return checkGuardError(
        table,
        checkState,
        `Remove or revise them explicitly before renaming the table.`,
      );
    }

    if (
      Object.prototype.hasOwnProperty.call(updatedValues, "namespace") &&
      namespaceKey(updatedValues.namespace) !== namespaceKey(table.namespace)
    ) {
      return checkGuardError(
        table,
        checkState,
        `Namespace changes are blocked until the opaque predicates are explicitly revised.`,
      );
    }

    if (Object.prototype.hasOwnProperty.call(updatedValues, "fields")) {
      if (!Array.isArray(updatedValues.fields)) {
        return checkGuardError(
          table,
          checkState,
          `Its column collection cannot be replaced implicitly.`,
        );
      }
      for (const field of table.fields ?? []) {
        const nextField = updatedValues.fields.find(
          (candidate) => String(candidate?.id) === String(field.id),
        );
        if (!nextField) {
          return checkGuardError(
            table,
            checkState,
            `Remove or revise them explicitly before deleting column ${field.name}.`,
          );
        }
        if (nextField.name !== field.name) {
          return checkGuardError(
            table,
            checkState,
            `Remove or revise them explicitly before renaming column ${field.name}.`,
          );
        }
        if (
          normalizedFieldType(nextField.type) !== normalizedFieldType(field.type) ||
          normalizedFieldSize(nextField.size) !== normalizedFieldSize(field.size)
        ) {
          return checkGuardError(
            table,
            checkState,
            `Remove or revise them explicitly before changing the type or size of column ${field.name}.`,
          );
        }
      }
    }
    return null;
  };

  const guardFieldUpdate = (tid, fid, updatedValues) => {
    const table = tables.find((candidate) => candidate.id === tid);
    const field = table?.fields?.find((candidate) => candidate.id === fid);
    const checkState = table && inspectSnowflakeChecks(table);
    if (!table || !field || !checkState?.hasChecks) return null;

    if (
      Object.prototype.hasOwnProperty.call(updatedValues, "name") &&
      updatedValues.name !== field.name
    ) {
      return checkGuardError(
        table,
        checkState,
        `Remove or revise them explicitly before renaming column ${field.name}.`,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(updatedValues, "type") &&
      normalizedFieldType(updatedValues.type) !== normalizedFieldType(field.type)
    ) {
      return checkGuardError(
        table,
        checkState,
        `Remove or revise them explicitly before changing the type of column ${field.name}.`,
      );
    }
    if (
      Object.prototype.hasOwnProperty.call(updatedValues, "size") &&
      normalizedFieldSize(updatedValues.size) !== normalizedFieldSize(field.size)
    ) {
      return checkGuardError(
        table,
        checkState,
        `Remove or revise them explicitly before changing the size of column ${field.name}.`,
      );
    }
    return null;
  };

  const setDatabase = useCallback(
    (next) => {
      setDatabaseRaw(next);
      if (!isApplyingRemoteRef?.current) {
        emitDelta({
          target: "database",
          action: "update",
          entityId: "database",
          data: [next],
        });
      }
    },
    [emitDelta, isApplyingRemoteRef],
  );

  const [targetNamespace, setTargetNamespace] = useState({
    catalog: "MODEL",
    schema: "PUBLIC",
  });

  const getTargetNamespace = useCallback(() => {
    if (
      tables[0]?.namespace &&
      typeof tables[0].namespace.catalog === "string" &&
      typeof tables[0].namespace.schema === "string"
    ) {
      return {
        catalog: tables[0].namespace.catalog,
        schema: tables[0].namespace.schema,
      };
    }
    return targetNamespace;
  }, [tables, targetNamespace]);

  const updateTargetNamespace = (nextNs) => {
    const catalog = (nextNs?.catalog || "MODEL").trim().toUpperCase();
    const schema = (nextNs?.schema || "PUBLIC").trim().toUpperCase();
    const ns = {
      id: `namespace:${catalog}.${schema}`,
      catalog,
      schema,
    };
    if (database === DB.SNOWFLAKE) {
      const blockedTable = tables.find((table) => {
        const checkState = inspectSnowflakeChecks(table);
        return (
          checkState.hasChecks &&
          namespaceKey(table.namespace) !== namespaceKey(ns)
        );
      });
      if (blockedTable) {
        const checkState = inspectSnowflakeChecks(blockedTable);
        return checkGuardError(
          blockedTable,
          checkState,
          "Namespace changes are blocked until the opaque predicates are explicitly revised.",
        );
      }
    }
    setTargetNamespace({ catalog, schema });
    setTables((prev) =>
      prev.map((t) => ({
        ...t,
        namespace: ns,
      })),
    );
    return undefined;
  };

  const addTable = (data, addToHistory = true) => {
    const id = nanoid();
    const activeNs = getTargetNamespace();
    const snowflakeNamespace =
      database === DB.SNOWFLAKE
        ? {
            id: `namespace:${activeNs.catalog}.${activeNs.schema}`,
            catalog: activeNs.catalog,
            schema: activeNs.schema,
          }
        : undefined;
    let tableName = `table_${id}`;
    if (database === DB.SNOWFLAKE) {
      let index = tables.length + 1;
      while (tables.some((t) => t.name === `TABLE_${index}`)) {
        index += 1;
      }
      tableName = `TABLE_${index}`;
    }
    let posX = transform.pan.x;
    let posY = transform.pan.y;
    while (
      tables.some((t) => Math.abs(t.x - posX) < 24 && Math.abs(t.y - posY) < 24)
    ) {
      posX += 32;
      posY += 32;
    }

    const newTable = {
      id,
      name: tableName,
      x: posX,
      y: posY,
      locked: false,
      fields: [
        database === DB.SNOWFLAKE
          ? {
              name: "ID",
              type: "NUMBER",
              size: "38,0",
              default: "",
              check: "",
              primary: true,
              unique: false,
              notNull: true,
              increment: false,
              comment: "",
              id: nanoid(),
            }
          : {
              name: "id",
              type: database === DB.GENERIC ? "INT" : "INTEGER",
              default: "",
              check: "",
              primary: true,
              unique: false,
              unsigned: true,
              notNull: true,
              increment: true,
              comment: "",
              id: nanoid(),
            },
      ],
      comment: "",
      indices: [],
      uniqueConstraints: [],
      ...(database === DB.SNOWFLAKE ? { checkConstraints: [] } : {}),
      color: defaultBlue,
      collapsed: false,
      ...(snowflakeNamespace ? { namespace: snowflakeNamespace } : {}),
    };
    if (data) {
      setTables((prev) => {
        const temp = prev.slice();
        temp.splice(data.index || tables.length, 0, data.table);
        return temp;
      });
    } else {
      setTables((prev) => [...prev, newTable]);
    }
    if (addToHistory) {
      setUndoStack((prev) => [
        ...prev,
        {
          data: data || { table: newTable, index: tables.length - 1 },
          action: Action.ADD,
          element: ObjectType.TABLE,
          message: t("add_table"),
        },
      ]);
      setRedoStack([]);
    }
    if (shouldEmit()) {
      const created = data?.table ?? newTable;
      emitDelta({
        target: "table",
        action: "create",
        entityId: created.id,
        data: [created],
      });
    }
  };

  const deleteTable = (id, addToHistory = true) => {
    const deletedTable = tables.find((table) => table.id === id);
    if (deletedTable) {
      const checkState = inspectSnowflakeChecks(deletedTable);
      if (checkState.hasChecks) {
        return checkGuardError(
          deletedTable,
          checkState,
          "Remove or revise them explicitly before deleting the table.",
        );
      }
    }
    if (addToHistory) {
      const rels = relationships.reduce((acc, r) => {
        if (r.startTableId === id || r.endTableId === id) {
          acc.push(r);
        }
        return acc;
      }, []);
      const deletedTableIndex = tables.findIndex((t) => t.id === id);
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.DELETE,
          element: ObjectType.TABLE,
          data: {
            table: deletedTable,
            relationship: rels,
            index: deletedTableIndex,
          },
          message: t("delete_table", { tableName: deletedTable.name }),
        },
      ]);
      setRedoStack([]);
      Toast.success(t("table_deleted"));
    }
    setRelationships((prevR) =>
      prevR.filter((e) => !(e.startTableId === id || e.endTableId === id)),
    );
    setTables((prev) => prev.filter((e) => e.id !== id));
    if (id === selectedElement.id) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: null,
        open: false,
      }));
    }
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "delete",
        entityId: id,
        data: [id],
      });
    }
    return undefined;
  };

  const updateTable = (id, updatedValues) => {
    const blocked = guardTableUpdate(id, updatedValues ?? {});
    if (blocked) return blocked;
    setTables((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...updatedValues };
        // CHECK migration history uses an explicit undefined value to restore
        // a v1 table that had no checkConstraints property.  Remove the key
        // rather than leaving an enumerable undefined field so undo restores
        // the raw editor snapshot while New/Open document replacement remains
        // outside this mutation path.
        if (
          Object.prototype.hasOwnProperty.call(updatedValues ?? {}, "checkConstraints") &&
          updatedValues.checkConstraints === undefined
        ) {
          delete next.checkConstraints;
        }
        return next;
      }),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "update",
        entityId: id,
        data: [id, updatedValues],
      });
    }
    return undefined;
  };

  const updateField = (tid, fid, updatedValues) => {
    const blocked = guardFieldUpdate(tid, fid, updatedValues ?? {});
    if (blocked) return blocked;
    setTables((prev) =>
      prev.map((table) => {
        if (tid === table.id) {
          return {
            ...table,
            fields: table.fields.map((field) =>
              fid === field.id ? { ...field, ...updatedValues } : field,
            ),
          };
        }
        return table;
      }),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "update",
        entityId: tid,
        data: [tid, fid, updatedValues],
      });
    }
    return undefined;
  };

  const deleteField = (field, tid, addToHistory = true) => {
    const table = tables.find((t) => t.id === tid);
    if (!table) return undefined;
    const checkState = inspectSnowflakeChecks(table);
    if (checkState.hasChecks) {
      return checkGuardError(
        table,
        checkState,
        `Remove or revise them explicitly before deleting column ${field.name}.`,
      );
    }
    const { fields, name } = table;
    const referencesField = (r) =>
      getRelationshipFields(r).some(
        (p) =>
          (r.startTableId === tid && p.startFieldId === field.id) ||
          (r.endTableId === tid && p.endFieldId === field.id),
      );
    if (addToHistory) {
      const rels = relationships.reduce((acc, r) => {
        if (referencesField(r)) {
          acc.push(r);
        }
        return acc;
      }, []);
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.EDIT,
          element: ObjectType.TABLE,
          component: "field_delete",
          tid: tid,
          data: {
            field: field,
            index: fields.findIndex((f) => f.id === field.id),
            relationship: rels,
          },
          message: t("edit_table", {
            tableName: name,
            extra: "[delete field]",
          }),
        },
      ]);
      setRedoStack([]);
    }
    setRelationships((prev) => prev.filter((e) => !referencesField(e)));
    updateTable(tid, {
      fields: fields.filter((e) => e.id !== field.id),
    });
    return undefined;
  };

  const addRelationship = (data, addToHistory = true) => {
    if (addToHistory) {
      setRelationships((prev) => {
        setUndoStack((prevUndo) => [
          ...prevUndo,
          {
            action: Action.ADD,
            element: ObjectType.RELATIONSHIP,
            data: {
              relationship: data,
              index: prevUndo.length,
            },
            message: t("add_relationship"),
          },
        ]);
        setRedoStack([]);
        return [...prev, data];
      });
    } else {
      setRelationships((prev) => {
        const temp = prev.slice();
        temp.splice(data.index, 0, data.relationship || data);
        return temp;
      });
    }
    if (shouldEmit()) {
      const created = data?.relationship ?? data;
      emitDelta({
        target: "relationship",
        action: "create",
        entityId: created.id,
        data: [created],
      });
    }
  };

  const deleteRelationship = (id, addToHistory = true) => {
    if (addToHistory) {
      const relationshipIndex = relationships.findIndex((r) => r.id === id);
      setUndoStack((prev) => [
        ...prev,
        {
          action: Action.DELETE,
          element: ObjectType.RELATIONSHIP,
          data: {
            relationship: relationships[relationshipIndex],
            index: relationshipIndex,
          },
          message: t("delete_relationship", {
            refName: relationships[relationshipIndex].name,
          }),
        },
      ]);
      setRedoStack([]);
    }
    setRelationships((prev) => prev.filter((e) => e.id !== id));
    if (shouldEmit()) {
      emitDelta({
        target: "relationship",
        action: "delete",
        entityId: id,
        data: [id],
      });
    }
    if (
      selectedElement.element === ObjectType.RELATIONSHIP &&
      selectedElement.id === id
    ) {
      setSelectedElement((prev) => ({
        ...prev,
        element: ObjectType.NONE,
        id: -1,
        open: false,
      }));
    }
  };

  const updateRelationship = (id, updatedValues) => {
    setRelationships((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedValues } : t)),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "relationship",
        action: "update",
        entityId: id,
        data: [id, updatedValues],
      });
    }
  };

  return (
    <DiagramContext.Provider
      value={{
        tables,
        setTables,
        addTable,
        updateTable,
        updateField,
        deleteField,
        deleteTable,
        relationships,
        setRelationships,
        addRelationship,
        deleteRelationship,
        updateRelationship,
        database,
        setDatabase,
        targetNamespace: getTargetNamespace(),
        updateTargetNamespace,
        tablesCount: tables.length,
        relationshipsCount: relationships.length,
      }}
    >
      {children}
    </DiagramContext.Provider>
  );
}
