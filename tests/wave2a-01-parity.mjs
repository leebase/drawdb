// Semantic parity helpers for Wave 2A fixtures.
//
// These deliberately compare the values that affect a Snowflake schema rather
// than relying on object counts, names, or the source SQL text alone.  The
// vector parameters are decoded from the canonical type text because v1's
// existing type contract stores the canonical SQL spelling in `text`.

function semanticDataType(dataType) {
  const vector = /^VECTOR\((INT|FLOAT),\s*(\d+)\)$/i.exec(
    String(dataType?.text ?? ""),
  );

  return {
    family: dataType?.family ?? null,
    text: dataType?.text ?? null,
    precision: dataType?.precision ?? null,
    scale: dataType?.scale ?? null,
    length: dataType?.length ?? null,
    vectorElement: vector ? vector[1].toUpperCase() : null,
    vectorDimension: vector ? Number(vector[2]) : null,
  };
}
function semanticColumn(column) {
  return {
    id: column.id,
    name: column.name,
    ordinal: column.ordinal,
    dataType: semanticDataType(column.data_type),
    nullable: column.nullable,
    default: column.default ?? null,
    comment: column.comment ?? null,
    check: column.check ?? null,
  };
}

function semanticConstraint(constraint) {
  return {
    id: constraint.id,
    name: constraint.name,
    kind: constraint.kind,
    // Preserve array order: it is the order of composite key columns.
    columns: [...(constraint.columns ?? [])],
    referencedTableId: constraint.referenced_table_id ?? null,
    referencedColumns: [...(constraint.referenced_columns ?? [])],
    expression: constraint.expression ?? null,
  };
}

function semanticRelationship(relationship) {
  return {
    id: relationship.id,
    name: relationship.name,
    sourceTableId: relationship.source_table_id,
    sourceColumnIds: [...(relationship.source_column_ids ?? [])],
    targetTableId: relationship.target_table_id,
    targetColumnIds: [...(relationship.target_column_ids ?? [])],
    cardinality: relationship.cardinality,
  };
}

export function semanticModel(projectOrModel) {
  const model = projectOrModel?.physical_model ?? projectOrModel;
  return {
    modelVersion: model.model_version,
    name: model.name,
    namespaces: (model.namespaces ?? []).map((namespace) => ({
      id: namespace.id,
      catalog: namespace.catalog,
      schema: namespace.schema,
    })),
    tables: (model.tables ?? []).map((table) => ({
      id: table.id,
      namespaceId: table.namespace_id,
      name: table.name,
      kind: table.kind,
      columns: (table.columns ?? []).map(semanticColumn),
      constraints: (table.constraints ?? []).map(semanticConstraint),
      comment: table.comment ?? null,
    })),
    relationships: (model.relationships ?? []).map(semanticRelationship),
  };
}

export function assertSemanticEqual(assert, actual, expected, message) {
  assert.deepEqual(semanticModel(actual), semanticModel(expected), message);
}
