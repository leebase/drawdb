import { Cardinality } from "../data/constants.js";

export function normalizeRelationshipEndpoints({
  startTableId,
  startFieldId,
  startField,
  startTableName,
  endTableId,
  endFieldId,
  endField,
  endTableName,
}) {
  const startIsUnique = Boolean(startField?.unique || startField?.primary);
  const endIsUnique = Boolean(endField?.unique || endField?.primary);

  if (startIsUnique && !endIsUnique) {
    return {
      startTableId: endTableId,
      startFieldId: endFieldId,
      endTableId: startTableId,
      endFieldId: startFieldId,
      cardinality: Cardinality.MANY_TO_ONE,
      name: `fk_${endTableName}_${endField?.name ?? ""}_${startTableName}`,
    };
  }

  if (!startIsUnique && endIsUnique) {
    return {
      startTableId,
      startFieldId,
      endTableId,
      endFieldId,
      cardinality: Cardinality.MANY_TO_ONE,
      name: `fk_${startTableName}_${startField?.name ?? ""}_${endTableName}`,
    };
  }

  return {
    startTableId,
    startFieldId,
    endTableId,
    endFieldId,
    cardinality: Cardinality.ONE_TO_ONE,
    name: `fk_${startTableName}_${startField?.name ?? ""}_${endTableName}`,
  };
}
