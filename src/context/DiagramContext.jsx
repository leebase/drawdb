import { createContext, useCallback, useState } from "react";
import { Action, DB, ObjectType, defaultBlue } from "../data/constants";
import { useTransform, useUndoRedo, useSelect, useCollab } from "../hooks";
import { Toast } from "@douyinfe/semi-ui";
import { useTranslation } from "react-i18next";
import { nanoid } from "nanoid";
import { getRelationshipFields } from "../utils/utils";

export const DiagramContext = createContext(null);

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

  const updateTargetNamespace = useCallback((nextNs) => {
    const catalog = (nextNs?.catalog || "MODEL").trim().toUpperCase();
    const schema = (nextNs?.schema || "PUBLIC").trim().toUpperCase();
    const ns = {
      id: `namespace:${catalog}.${schema}`,
      catalog,
      schema,
    };
    setTargetNamespace({ catalog, schema });
    setTables((prev) =>
      prev.map((t) => ({
        ...t,
        namespace: ns,
      })),
    );
  }, []);

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
    if (addToHistory) {
      const rels = relationships.reduce((acc, r) => {
        if (r.startTableId === id || r.endTableId === id) {
          acc.push(r);
        }
        return acc;
      }, []);
      const deletedTable = tables.find((t) => t.id === id);
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
  };

  const updateTable = (id, updatedValues) => {
    setTables((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updatedValues } : t)),
    );
    if (shouldEmit()) {
      emitDelta({
        target: "table",
        action: "update",
        entityId: id,
        data: [id, updatedValues],
      });
    }
  };

  const updateField = (tid, fid, updatedValues) => {
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
  };

  const deleteField = (field, tid, addToHistory = true) => {
    const { fields, name } = tables.find((t) => t.id === tid);
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
