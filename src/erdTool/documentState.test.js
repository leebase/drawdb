import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveNativeChip, diagramRevision } from "./documentState.js";

describe("documentState diagramRevision", () => {
  const baseDiagram = {
    database: "snowflake",
    title: "Test ERD",
    tables: [
      { id: 0, name: "USERS", x: 100, y: 150, fields: [] },
      { id: 1, name: "ORDERS", x: 300, y: 200, fields: [] },
    ],
    relationships: [
      { id: 0, startTableId: 1, endTableId: 0 },
    ],
    notes: [{ id: 0, title: "Note 1", content: "hello" }],
    areas: [{ id: 0, name: "Area 1", x: 50, y: 50, width: 200, height: 200 }],
    types: [{ name: "custom_type", fields: [] }],
    enums: [{ name: "status", values: ["active", "inactive"] }],
    transform: { pan: { x: 0, y: 0 }, zoom: 1 },
  };

  it("transform change does not alter revision", () => {
    const initialRevision = diagramRevision(baseDiagram);
    const diagramWithPanZoom = {
      ...baseDiagram,
      transform: {
        pan: { x: 450, y: -120 },
        zoom: 2.25,
      },
    };
    const revisedTransformRevision = diagramRevision(diagramWithPanZoom);
    assert.equal(revisedTransformRevision, initialRevision);
  });

  it("table move does alter revision", () => {
    const initialRevision = diagramRevision(baseDiagram);
    const diagramWithMovedTable = {
      ...baseDiagram,
      tables: [
        { id: 0, name: "USERS", x: 100, y: 150, fields: [] },
        { id: 1, name: "ORDERS", x: 320, y: 200, fields: [] },
      ],
    };
    const movedRevision = diagramRevision(diagramWithMovedTable);
    assert.notEqual(movedRevision, initialRevision);
  });

  it("structural diagram changes alter revision", () => {
    const initialRevision = diagramRevision(baseDiagram);
    const changedTitle = diagramRevision({ ...baseDiagram, title: "Renamed" });
    assert.notEqual(changedTitle, initialRevision);

    const changedDatabase = diagramRevision({ ...baseDiagram, database: "postgres" });
    assert.notEqual(changedDatabase, initialRevision);

    const changedRel = diagramRevision({ ...baseDiagram, relationships: [] });
    assert.notEqual(changedRel, initialRevision);
  });
});

describe("documentState deriveNativeChip", () => {
  it("returns kind 'dirty' and label 'Unsaved changes' when dirty", () => {
    assert.deepEqual(
      deriveNativeChip({ dirty: true, hasPath: false, lastSavedAt: null }),
      { kind: "dirty", label: "Unsaved changes" },
    );
    assert.deepEqual(
      deriveNativeChip({ dirty: true, hasPath: true, lastSavedAt: new Date() }),
      { kind: "dirty", label: "Unsaved changes" },
    );
  });

  it("returns kind 'never_saved' and label 'Never saved' when not dirty and without path", () => {
    assert.deepEqual(
      deriveNativeChip({ dirty: false, hasPath: false, lastSavedAt: null }),
      { kind: "never_saved", label: "Never saved" },
    );
    assert.deepEqual(
      deriveNativeChip({ dirty: false, hasPath: false }),
      { kind: "never_saved", label: "Never saved" },
    );
  });

  it("returns kind 'saved' and label 'Saved' when hasPath is true without lastSavedAt", () => {
    assert.deepEqual(
      deriveNativeChip({ dirty: false, hasPath: true, lastSavedAt: null }),
      { kind: "saved", label: "Saved" },
    );
    assert.deepEqual(
      deriveNativeChip({ dirty: false, hasPath: true, lastSavedAt: undefined }),
      { kind: "saved", label: "Saved" },
    );
  });

  it("formats time with a fixed Date when saved with path", () => {
    const fixedDate = new Date(2026, 8, 3, 14, 35, 0);
    const expectedTime = fixedDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    assert.deepEqual(
      deriveNativeChip({ dirty: false, hasPath: true, lastSavedAt: fixedDate }),
      { kind: "saved", label: `Saved · ${expectedTime}` },
    );
  });

  it("accepts an ISO string timestamp and formats time identically", () => {
    const fixedDate = new Date(2026, 8, 3, 14, 35, 0);
    const expectedTime = fixedDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
    assert.deepEqual(
      deriveNativeChip({
        dirty: false,
        hasPath: true,
        lastSavedAt: fixedDate.toISOString(),
      }),
      { kind: "saved", label: `Saved · ${expectedTime}` },
    );
  });

  it("falls back to 'Saved' if lastSavedAt is an invalid date string", () => {
    assert.deepEqual(
      deriveNativeChip({
        dirty: false,
        hasPath: true,
        lastSavedAt: "not-a-valid-date",
      }),
      { kind: "saved", label: "Saved" },
    );
  });
});
