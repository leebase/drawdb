export function diagramRevision(diagram) {
  if (!diagram) return "";
  return JSON.stringify({
    database: diagram.database,
    title: diagram.title,
    tables: diagram.tables ?? [],
    relationships: diagram.relationships ?? [],
    notes: diagram.notes ?? [],
    areas: diagram.areas ?? [],
    types: diagram.types ?? [],
    enums: diagram.enums ?? [],
  });
}

export function deriveNativeChip({ dirty, hasPath, lastSavedAt }) {
  if (dirty) {
    return { kind: "dirty", label: "Unsaved changes" };
  }
  if (!hasPath) {
    return { kind: "never_saved", label: "Never saved" };
  }
  if (!lastSavedAt) {
    return { kind: "saved", label: "Saved" };
  }

  const date =
    lastSavedAt instanceof Date ? lastSavedAt : new Date(lastSavedAt);
  if (isNaN(date.getTime())) {
    return { kind: "saved", label: "Saved" };
  }

  const time = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return { kind: "saved", label: `Saved · ${time}` };
}
