import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SNOWFLAKE_TYPE_FAMILIES,
  SNOWFLAKE_TYPE_ALIASES,
  SNOWFLAKE_TYPE_BOUNDS,
  canonicalizeSnowflakeType,
  snowflakeTypeText,
  validateSnowflakeType,
  isSnowflakeTypeComplete,
  snowflakeTypeFromField,
  snowflakeTypeSize,
} from "../src/erdTool/snowflakeTypeContract.js";

describe("Snowflake Type Contract", () => {
  it("exports frozen constants matching the Snowflake specification", () => {
    assert.ok(Object.isFrozen(SNOWFLAKE_TYPE_FAMILIES));
    assert.ok(Object.isFrozen(SNOWFLAKE_TYPE_ALIASES));
    assert.ok(Object.isFrozen(SNOWFLAKE_TYPE_BOUNDS));
    assert.equal(SNOWFLAKE_TYPE_FAMILIES.length, 16);
  });

  it("resolves every alias to its expected family with case-insensitivity and multi-word support", () => {
    for (const [alias, expectedFamily] of Object.entries(SNOWFLAKE_TYPE_ALIASES)) {
      const canonicalUpper = canonicalizeSnowflakeType(alias);
      assert.equal(
        canonicalUpper.family,
        expectedFamily,
        `Alias ${alias} must resolve to family ${expectedFamily}`,
      );

      const canonicalLower = canonicalizeSnowflakeType(alias.toLowerCase());
      assert.equal(
        canonicalLower.family,
        expectedFamily,
        `Lowercase alias ${alias.toLowerCase()} must resolve to family ${expectedFamily}`,
      );
    }
  });

  it("resolves documented defaults for NUMBER, VARCHAR, CHAR, BINARY, TIME, and TIMESTAMP variants", () => {
    const numberDefault = canonicalizeSnowflakeType("NUMBER");
    assert.deepEqual(numberDefault, {
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    });

    const decimalDefault = canonicalizeSnowflakeType("DECIMAL");
    assert.equal(decimalDefault.text, "NUMBER(38, 0)");
    assert.equal(decimalDefault.precision, 38);
    assert.equal(decimalDefault.scale, 0);

    const intDefault = canonicalizeSnowflakeType("INT");
    assert.equal(intDefault.text, "NUMBER(38, 0)");
    assert.equal(intDefault.precision, 38);
    assert.equal(intDefault.scale, 0);
    assert.throws(() => canonicalizeSnowflakeType("INT(10)"));

    const varcharDefault = canonicalizeSnowflakeType("VARCHAR");
    assert.deepEqual(varcharDefault, {
      family: "VARCHAR",
      text: "VARCHAR(16777216)",
      precision: null,
      scale: null,
      length: 16777216,
      vector_element_type: null,
      vector_dimension: null,
    });

    const textDefault = canonicalizeSnowflakeType("TEXT");
    assert.equal(textDefault.text, "VARCHAR(16777216)");
    assert.equal(textDefault.length, 16777216);

    const charDefault = canonicalizeSnowflakeType("CHAR");
    assert.deepEqual(charDefault, {
      family: "VARCHAR",
      text: "VARCHAR(1)",
      precision: null,
      scale: null,
      length: 1,
      vector_element_type: null,
      vector_dimension: null,
    });

    const binaryDefault = canonicalizeSnowflakeType("BINARY");
    assert.deepEqual(binaryDefault, {
      family: "BINARY",
      text: "BINARY(8388608)",
      precision: null,
      scale: null,
      length: 8388608,
      vector_element_type: null,
      vector_dimension: null,
    });

    const timeDefault = canonicalizeSnowflakeType("TIME");
    assert.deepEqual(timeDefault, {
      family: "TIME",
      text: "TIME(9)",
      precision: 9,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    });

    const timestampNtzDefault = canonicalizeSnowflakeType("TIMESTAMP_NTZ");
    assert.equal(timestampNtzDefault.text, "TIMESTAMP_NTZ(9)");
    assert.equal(timestampNtzDefault.precision, 9);

    const timestampDefault = canonicalizeSnowflakeType("TIMESTAMP");
    assert.equal(timestampDefault.family, "TIMESTAMP_NTZ");
    assert.equal(timestampDefault.text, "TIMESTAMP_NTZ(9)");
    assert.equal(timestampDefault.precision, 9);
  });

  it("handles the three timestampTypeMapping options and rejects invalid mappings", () => {
    for (const mapping of ["TIMESTAMP_NTZ", "TIMESTAMP_LTZ", "TIMESTAMP_TZ"]) {
      const canonical = canonicalizeSnowflakeType("TIMESTAMP", {
        timestampTypeMapping: mapping,
      });
      assert.equal(canonical.family, mapping);
      assert.equal(canonical.text, `${mapping}(9)`);

      const fromField = snowflakeTypeFromField(
        { type: "TIMESTAMP" },
        { timestampTypeMapping: mapping },
      );
      assert.equal(fromField.family, mapping);
      assert.equal(fromField.text, `${mapping}(9)`);
    }

    assert.throws(
      () =>
        canonicalizeSnowflakeType("TIMESTAMP", {
          timestampTypeMapping: "INVALID_MAPPING",
        }),
      /invalid timestampTypeMapping/i,
    );

    assert.throws(
      () =>
        snowflakeTypeFromField(
          { type: "TIMESTAMP" },
          { timestampTypeMapping: "INVALID_MAPPING" },
        ),
      /invalid timestampTypeMapping/i,
    );
  });

  it("accepts maximum bounds and rejects max+1 for VARCHAR, BINARY, and NUMBER", () => {
    const varcharMax = canonicalizeSnowflakeType("VARCHAR(134217728)");
    assert.equal(varcharMax.length, 134217728);
    assert.throws(
      () => canonicalizeSnowflakeType("VARCHAR(134217729)"),
      /between 1 and|maximum|bound/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("VARCHAR(0)"),
      /between 1 and|maximum|bound/i,
    );

    const binaryMax = canonicalizeSnowflakeType("BINARY(67108864)");
    assert.equal(binaryMax.length, 67108864);
    assert.throws(
      () => canonicalizeSnowflakeType("BINARY(67108865)"),
      /between 1 and|maximum|bound/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("BINARY(0)"),
      /between 1 and|maximum|bound/i,
    );

    const numberMax = canonicalizeSnowflakeType("NUMBER(38, 37)");
    assert.equal(numberMax.precision, 38);
    assert.equal(numberMax.scale, 37);
    assert.throws(
      () => canonicalizeSnowflakeType("NUMBER(39, 0)"),
      /between 1 and|maximum|bound/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("NUMBER(0, 0)"),
      /between 1 and|maximum|bound/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("NUMBER(38, 38)"),
      /between 0 and|maximum|bound/i,
    );
  });

  it("accepts valid VECTOR types and rejects invalid or bare VECTOR in canonicalizeSnowflakeType", () => {
    const vectorInt = canonicalizeSnowflakeType("VECTOR(INT, 1)");
    assert.deepEqual(vectorInt, {
      family: "VECTOR",
      text: "VECTOR(INT, 1)",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: "INT",
      vector_dimension: 1,
    });

    const vectorFloat = canonicalizeSnowflakeType("VECTOR(FLOAT, 4096)");
    assert.deepEqual(vectorFloat, {
      family: "VECTOR",
      text: "VECTOR(FLOAT, 4096)",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: "FLOAT",
      vector_dimension: 4096,
    });

    assert.throws(
      () => canonicalizeSnowflakeType("VECTOR"),
      /VECTOR/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("VECTOR(INT)"),
      /VECTOR/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("VECTOR(INT, 3, 4)"),
      /VECTOR/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("VECTOR(NUMBER, 3)"),
      /INT or FLOAT/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("VECTOR(INT, 0)"),
      /between 1 and|maximum|bound/i,
    );
    assert.throws(
      () => canonicalizeSnowflakeType("VECTOR(FLOAT, 4097)"),
      /between 1 and|maximum|bound/i,
    );
  });

  it("validates resolved and unresolved VECTOR, rejects half-resolved and non-VECTOR with vector fields", () => {
    const resolvedVector = {
      family: "VECTOR",
      text: "VECTOR(INT, 3)",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: "INT",
      vector_dimension: 3,
    };
    assert.deepEqual(validateSnowflakeType(resolvedVector), resolvedVector);
    assert.equal(isSnowflakeTypeComplete(resolvedVector), true);

    const unresolvedVector = {
      family: "VECTOR",
      text: "VECTOR",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
    assert.deepEqual(validateSnowflakeType(unresolvedVector), unresolvedVector);
    assert.equal(isSnowflakeTypeComplete(unresolvedVector), false);

    assert.throws(
      () =>
        validateSnowflakeType({
          family: "VECTOR",
          text: "VECTOR",
          precision: null,
          scale: null,
          length: null,
          vector_element_type: "INT",
          vector_dimension: null,
        }),
      /VECTOR requires both vector_element_type and vector_dimension or neither/,
    );

    assert.throws(
      () =>
        validateSnowflakeType({
          family: "VECTOR",
          text: "VECTOR",
          precision: null,
          scale: null,
          length: null,
          vector_element_type: null,
          vector_dimension: 3,
        }),
      /VECTOR requires both vector_element_type and vector_dimension or neither/,
    );

    assert.throws(
      () =>
        validateSnowflakeType({
          family: "NUMBER",
          text: "NUMBER(38, 0)",
          precision: 38,
          scale: 0,
          length: null,
          vector_element_type: "INT",
          vector_dimension: null,
        }),
      /vector_element_type and vector_dimension must be null for NUMBER/,
    );

    assert.throws(
      () =>
        validateSnowflakeType({
          family: "VARCHAR",
          text: "VARCHAR(10)",
          precision: null,
          scale: null,
          length: 10,
          vector_element_type: null,
          vector_dimension: 10,
        }),
      /vector_element_type and vector_dimension must be null for VARCHAR/,
    );
  });

  it("performs field round trip snowflakeTypeSize(snowflakeTypeFromField(f)) for each family", () => {
    const testCases = [
      { field: { type: "NUMBER", size: "10,2" }, expectedSize: "10,2" },
      { field: { type: "FLOAT" }, expectedSize: undefined },
      { field: { type: "VARCHAR", size: 500 }, expectedSize: 500 },
      { field: { type: "DATE" }, expectedSize: undefined },
      { field: { type: "TIME", size: 6 }, expectedSize: 6 },
      { field: { type: "TIMESTAMP_NTZ", size: 3 }, expectedSize: 3 },
      { field: { type: "TIMESTAMP_LTZ", size: 3 }, expectedSize: 3 },
      { field: { type: "TIMESTAMP_TZ", size: 3 }, expectedSize: 3 },
      { field: { type: "BOOLEAN" }, expectedSize: undefined },
      { field: { type: "BINARY", size: 2048 }, expectedSize: 2048 },
      { field: { type: "VARIANT" }, expectedSize: undefined },
      { field: { type: "OBJECT" }, expectedSize: undefined },
      { field: { type: "ARRAY" }, expectedSize: undefined },
      { field: { type: "GEOGRAPHY" }, expectedSize: undefined },
      { field: { type: "GEOMETRY" }, expectedSize: undefined },
      { field: { type: "VECTOR", size: "FLOAT,1536" }, expectedSize: "FLOAT,1536" },
      { field: { type: "VECTOR", size: "" }, expectedSize: "" },
    ];

    for (const { field, expectedSize } of testCases) {
      const canonical = snowflakeTypeFromField(field);
      const roundTripSize = snowflakeTypeSize(canonical);
      assert.equal(
        roundTripSize,
        expectedSize,
        `Field type ${field.type} size roundtrip must match`,
      );
      assert.doesNotThrow(() => validateSnowflakeType(canonical));
    }
  });

  it("satisfies parse -> text -> parse equality for representative types", () => {
    const representative = [
      "NUMBER(10, 2)",
      "NUMBER",
      "VARCHAR(255)",
      "VARCHAR",
      "CHAR",
      "BINARY(4096)",
      "BINARY",
      "TIME(3)",
      "TIMESTAMP_NTZ(6)",
      "TIMESTAMP_LTZ(0)",
      "TIMESTAMP_TZ(9)",
      "VECTOR(INT, 3)",
      "VECTOR(FLOAT, 1536)",
      "FLOAT",
      "DATE",
      "BOOLEAN",
      "VARIANT",
      "OBJECT",
      "ARRAY",
      "GEOGRAPHY",
      "GEOMETRY",
      "DOUBLE PRECISION",
      "TEXT",
      "DECIMAL(18, 4)",
      "BIGINT",
      "VARBINARY(1024)",
    ];

    for (const ddl of representative) {
      const canonical = canonicalizeSnowflakeType(ddl);
      const text = snowflakeTypeText(canonical);
      assert.equal(text, canonical.text);
      const reparsed = canonicalizeSnowflakeType(text);
      assert.deepEqual(reparsed, canonical);
    }
  });

  it("rejects unsupported types with an unsupported error message", () => {
    const unsupportedList = [
      "DECFLOAT",
      "MAP",
      "FILE",
      "UUID",
      "OBJECT(a INT)",
      "ARRAY(VARCHAR)",
      "UNKNOWN_TYPE",
    ];

    for (const typeStr of unsupportedList) {
      assert.throws(
        () => canonicalizeSnowflakeType(typeStr),
        /unsupported/i,
        `Expected ${typeStr} to be rejected as unsupported`,
      );
    }
  });
});

describe("Snowflake Type Contract — argument edge cases", () => {
  it("rejects non-integer, padded-but-valid, empty, and surplus arguments", () => {
    for (const bad of ["NUMBER(1.5)", "NUMBER(1e3)", "NUMBER(-1)", "NUMBER()", "VARCHAR(abc)", "VARCHAR(10,)", "VECTOR(INT, 3, 4)", "VECTOR(INT, 3.5)", "VECTOR(INT, -3)"]) {
      assert.throws(() => canonicalizeSnowflakeType(bad), undefined, `${bad} must be rejected`);
    }
    assert.equal(canonicalizeSnowflakeType("NUMBER( 10 , 2 )").text, "NUMBER(10, 2)");
    assert.equal(canonicalizeSnowflakeType("vector( int , 3 )").text, "VECTOR(INT, 3)");
    assert.equal(canonicalizeSnowflakeType("VECTOR(float,4096)").vector_element_type, "FLOAT");
  });
});
