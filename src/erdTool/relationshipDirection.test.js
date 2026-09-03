import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Cardinality } from "../data/constants.js";
import { normalizeRelationshipEndpoints } from "./relationshipDirection.js";

describe("normalizeRelationshipEndpoints", () => {
  it("swaps endpoints on PK -> FK drag", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-customer",
      startFieldId: "fld-cust-pk",
      startField: { id: "fld-cust-pk", name: "CUSTOMER_ID", primary: true, unique: false },
      startTableName: "CUSTOMER",
      endTableId: "tbl-orders",
      endFieldId: "fld-ord-fk",
      endField: { id: "fld-ord-fk", name: "CUSTOMER_ID", primary: false, unique: false },
      endTableName: "ORDERS",
    });

    assert.equal(result.startTableId, "tbl-orders");
    assert.equal(result.startFieldId, "fld-ord-fk");
    assert.equal(result.endTableId, "tbl-customer");
    assert.equal(result.endFieldId, "fld-cust-pk");
    assert.equal(result.cardinality, Cardinality.MANY_TO_ONE);
    assert.equal(result.name, "fk_ORDERS_CUSTOMER_ID_CUSTOMER");
  });

  it("swaps endpoints when start is unique and end is non-key", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-user",
      startFieldId: "fld-user-email",
      startField: { id: "fld-user-email", name: "EMAIL", primary: false, unique: true },
      startTableName: "USER_ACCOUNT",
      endTableId: "tbl-audit",
      endFieldId: "fld-audit-email",
      endField: { id: "fld-audit-email", name: "USER_EMAIL", primary: false, unique: false },
      endTableName: "AUDIT_LOG",
    });

    assert.equal(result.startTableId, "tbl-audit");
    assert.equal(result.startFieldId, "fld-audit-email");
    assert.equal(result.endTableId, "tbl-user");
    assert.equal(result.endFieldId, "fld-user-email");
    assert.equal(result.cardinality, Cardinality.MANY_TO_ONE);
    assert.equal(result.name, "fk_AUDIT_LOG_USER_EMAIL_USER_ACCOUNT");
  });

  it("keeps endpoints order on FK -> PK drag", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-orders",
      startFieldId: "fld-ord-fk",
      startField: { id: "fld-ord-fk", name: "CUSTOMER_ID", primary: false, unique: false },
      startTableName: "ORDERS",
      endTableId: "tbl-customer",
      endFieldId: "fld-cust-pk",
      endField: { id: "fld-cust-pk", name: "CUSTOMER_ID", primary: true, unique: false },
      endTableName: "CUSTOMER",
    });

    assert.equal(result.startTableId, "tbl-orders");
    assert.equal(result.startFieldId, "fld-ord-fk");
    assert.equal(result.endTableId, "tbl-customer");
    assert.equal(result.endFieldId, "fld-cust-pk");
    assert.equal(result.cardinality, Cardinality.MANY_TO_ONE);
    assert.equal(result.name, "fk_ORDERS_CUSTOMER_ID_CUSTOMER");
  });

  it("keeps endpoints order when end is unique and start is non-key", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-audit",
      startFieldId: "fld-audit-email",
      startField: { id: "fld-audit-email", name: "USER_EMAIL", primary: false, unique: false },
      startTableName: "AUDIT_LOG",
      endTableId: "tbl-user",
      endFieldId: "fld-user-email",
      endField: { id: "fld-user-email", name: "EMAIL", primary: false, unique: true },
      endTableName: "USER_ACCOUNT",
    });

    assert.equal(result.startTableId, "tbl-audit");
    assert.equal(result.startFieldId, "fld-audit-email");
    assert.equal(result.endTableId, "tbl-user");
    assert.equal(result.endFieldId, "fld-user-email");
    assert.equal(result.cardinality, Cardinality.MANY_TO_ONE);
    assert.equal(result.name, "fk_AUDIT_LOG_USER_EMAIL_USER_ACCOUNT");
  });

  it("keeps endpoints order and returns ONE_TO_ONE when both fields are unique", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-profile",
      startFieldId: "fld-profile-user-id",
      startField: { id: "fld-profile-user-id", name: "USER_ID", primary: true, unique: false },
      startTableName: "USER_PROFILE",
      endTableId: "tbl-user",
      endFieldId: "fld-user-id",
      endField: { id: "fld-user-id", name: "ID", primary: false, unique: true },
      endTableName: "USER_ACCOUNT",
    });

    assert.equal(result.startTableId, "tbl-profile");
    assert.equal(result.startFieldId, "fld-profile-user-id");
    assert.equal(result.endTableId, "tbl-user");
    assert.equal(result.endFieldId, "fld-user-id");
    assert.equal(result.cardinality, Cardinality.ONE_TO_ONE);
    assert.equal(result.name, "fk_USER_PROFILE_USER_ID_USER_ACCOUNT");
  });

  it("keeps endpoints order and returns ONE_TO_ONE when neither field is unique", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-temp-a",
      startFieldId: "fld-a",
      startField: { id: "fld-a", name: "STATUS_A", primary: false, unique: false },
      startTableName: "TEMP_A",
      endTableId: "tbl-temp-b",
      endFieldId: "fld-b",
      endField: { id: "fld-b", name: "STATUS_B", primary: false, unique: false },
      endTableName: "TEMP_B",
    });

    assert.equal(result.startTableId, "tbl-temp-a");
    assert.equal(result.startFieldId, "fld-a");
    assert.equal(result.endTableId, "tbl-temp-b");
    assert.equal(result.endFieldId, "fld-b");
    assert.equal(result.cardinality, Cardinality.ONE_TO_ONE);
    assert.equal(result.name, "fk_TEMP_A_STATUS_A_TEMP_B");
  });

  it("computes relationship name after swap using the post-swap start table, start field, and end table", () => {
    const result = normalizeRelationshipEndpoints({
      startTableId: "tbl-parent",
      startFieldId: "fld-parent-pk",
      startField: { id: "fld-parent-pk", name: "PARENT_ID", primary: true, unique: false },
      startTableName: "PARENT_TABLE",
      endTableId: "tbl-child",
      endFieldId: "fld-child-fk",
      endField: { id: "fld-child-fk", name: "CHILD_PARENT_ID", primary: false, unique: false },
      endTableName: "CHILD_TABLE",
    });

    // The name must reflect the new start (CHILD_TABLE), new start field (CHILD_PARENT_ID), and new end (PARENT_TABLE)
    assert.equal(result.name, "fk_CHILD_TABLE_CHILD_PARENT_ID_PARENT_TABLE");
    assert.notEqual(result.name, "fk_PARENT_TABLE_PARENT_ID_CHILD_TABLE");
  });
});
