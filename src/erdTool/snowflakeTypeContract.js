/*
 * The Snowflake semantic type contract.
 *
 * This module is deliberately free of editor, persistence, and Snowflake SDK
 * dependencies.  Boundaries may adapt their own transport shape, but the
 * family/alias/default/bounds rules live here so that a type cannot acquire a
 * different meaning merely by crossing the application.
 */

const TYPE_KEYS = Object.freeze([
  "family",
  "text",
  "precision",
  "scale",
  "length",
  "element_type",
  "dimension",
]);

export const SNOWFLAKE_TYPE_KEYS = TYPE_KEYS;

export const SNOWFLAKE_TYPE_FAMILIES = Object.freeze([
  "NUMBER",
  "FLOAT",
  "VARCHAR",
  "BINARY",
  "DATE",
  "TIME",
  "TIMESTAMP_NTZ",
  "TIMESTAMP_LTZ",
  "TIMESTAMP_TZ",
  "BOOLEAN",
  "VARIANT",
  "OBJECT",
  "ARRAY",
  "GEOGRAPHY",
  "GEOMETRY",
  "VECTOR",
]);

const SUPPORTED_FAMILIES = new Set(SNOWFLAKE_TYPE_FAMILIES);

const ALIAS_ENTRIES = [
  ["NUMBER", "NUMBER"],
  ["DECIMAL", "NUMBER"],
  ["DEC", "NUMBER"],
  ["NUMERIC", "NUMBER"],
  ["INT", "NUMBER", { fixedInteger: true }],
  ["INTEGER", "NUMBER", { fixedInteger: true }],
  ["BIGINT", "NUMBER", { fixedInteger: true }],
  ["SMALLINT", "NUMBER", { fixedInteger: true }],
  ["TINYINT", "NUMBER", { fixedInteger: true }],
  ["BYTEINT", "NUMBER", { fixedInteger: true }],

  ["FLOAT", "FLOAT"],
  ["FLOAT4", "FLOAT"],
  ["FLOAT8", "FLOAT"],
  ["DOUBLE", "FLOAT"],
  ["DOUBLE PRECISION", "FLOAT"],
  ["REAL", "FLOAT"],

  ["BOOLEAN", "BOOLEAN"],

  ["VARCHAR", "VARCHAR"],
  ["STRING", "VARCHAR"],
  ["TEXT", "VARCHAR"],
  ["VARCHAR2", "VARCHAR"],
  ["NVARCHAR", "VARCHAR"],
  ["NVARCHAR2", "VARCHAR"],
  ["CHAR VARYING", "VARCHAR"],
  ["NCHAR VARYING", "VARCHAR"],
  ["CHAR", "VARCHAR", { charDefault: true }],
  ["CHARACTER", "VARCHAR", { charDefault: true }],
  ["NCHAR", "VARCHAR", { charDefault: true }],

  ["BINARY", "BINARY"],
  ["VARBINARY", "BINARY"],

  ["DATE", "DATE"],
  ["TIME", "TIME"],
  ["TIMESTAMP_NTZ", "TIMESTAMP_NTZ"],
  ["TIMESTAMPNTZ", "TIMESTAMP_NTZ"],
  ["TIMESTAMP WITHOUT TIME ZONE", "TIMESTAMP_NTZ"],
  ["DATETIME", "TIMESTAMP_NTZ"],
  ["TIMESTAMP_LTZ", "TIMESTAMP_LTZ"],
  ["TIMESTAMPLTZ", "TIMESTAMP_LTZ"],
  ["TIMESTAMP WITH LOCAL TIME ZONE", "TIMESTAMP_LTZ"],
  ["TIMESTAMP_TZ", "TIMESTAMP_TZ"],
  ["TIMESTAMPTZ", "TIMESTAMP_TZ"],
  ["TIMESTAMP WITH TIME ZONE", "TIMESTAMP_TZ"],
  ["TIMESTAMP", "TIMESTAMP"],

  ["VARIANT", "VARIANT"],
  ["OBJECT", "OBJECT"],
  ["ARRAY", "ARRAY"],
  ["GEOGRAPHY", "GEOGRAPHY"],
  ["GEOMETRY", "GEOMETRY"],
  ["VECTOR", "VECTOR"],
];

const aliasInfo = new Map(
  ALIAS_ENTRIES.map(([alias, family, flags = {}]) => [
    alias,
    Object.freeze({ family, ...flags }),
  ]),
);

export const SNOWFLAKE_TYPE_ALIASES = Object.freeze(
  Object.fromEntries(
    [...aliasInfo.entries()].map(([alias, info]) => [alias, info.family]),
  ),
);

const PARAMETERLESS_FAMILIES = new Set([
  "FLOAT",
  "BOOLEAN",
  "DATE",
  "VARIANT",
  "OBJECT",
  "ARRAY",
  "GEOGRAPHY",
  "GEOMETRY",
]);

function fail(message, label = "Snowflake type") {
  throw new Error(`${label}: ${message}`);
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeWhitespace(value) {
  return String(value).trim().replace(/\s+/g, " ").toUpperCase();
}

function normalizeTimestampMapping(options = {}) {
  const mapping = options.timestampTypeMapping;
  if (typeof mapping === "string") return normalizeWhitespace(mapping);
  if (isRecord(mapping)) {
    return normalizeWhitespace(
      mapping.TIMESTAMP ?? mapping.timestamp ?? mapping.default ?? "",
    );
  }
  return "";
}

function aliasFor(value, label) {
  const normalized = normalizeWhitespace(value);
  const info = aliasInfo.get(normalized);
  if (!info) {
    fail(`unsupported type family ${normalized}`, label);
  }
  return { alias: normalized, ...info };
}

function integer(value, label) {
  if (typeof value === "number") {
    if (Number.isInteger(value)) return value;
    fail("must be an integer", label);
  }
  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  fail("must be an integer", label);
}

function optionalInteger(value, label) {
  if (value === undefined || value === null) return null;
  return integer(value, label);
}

function splitArguments(value, label) {
  const text = String(value).trim();
  if (!text) fail("parameter list must not be empty", label);
  const args = [];
  let current = "";
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      current += char;
      if (char === "'" && text[index + 1] === "'") {
        current += text[index + 1];
        index += 1;
      } else if (char === "'") {
        inString = false;
      }
      continue;
    }
    if (char === "'") {
      inString = true;
      current += char;
    } else if (char === "(") {
      depth += 1;
      current += char;
    } else if (char === ")") {
      depth -= 1;
      if (depth < 0) fail("unbalanced parameter list", label);
      current += char;
    } else if (char === "," && depth === 0) {
      if (!current.trim()) fail("parameters must not be blank", label);
      args.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (inString || depth !== 0) fail("unbalanced parameter list", label);
  if (!current.trim()) fail("parameters must not be blank", label);
  args.push(current.trim());
  return args;
}

function splitTypeExpression(value, label) {
  const text = String(value).trim();
  if (!text) fail("must not be blank", label);
  const open = text.indexOf("(");
  if (open < 0) return { name: text, args: [] };
  if (!text.endsWith(")")) fail("has an unbalanced parameter list", label);
  const name = text.slice(0, open).trim();
  const contents = text.slice(open + 1, -1);
  if (!name || contents.includes("\n")) {
    fail("is not a supported type expression", label);
  }
  return { name, args: splitArguments(contents, label) };
}

function blankType(family) {
  return {
    family,
    text: null,
    precision: null,
    scale: null,
    length: null,
    element_type: null,
    dimension: null,
  };
}

function typeText(type) {
  const { family } = type;
  switch (family) {
    case "NUMBER":
      return `NUMBER(${type.precision}, ${type.scale})`;
    case "FLOAT":
      return "FLOAT";
    case "VARCHAR":
      return `VARCHAR(${type.length})`;
    case "BINARY":
      return `BINARY(${type.length})`;
    case "DATE":
      return "DATE";
    case "TIME":
      return `TIME(${type.precision})`;
    case "TIMESTAMP_NTZ":
    case "TIMESTAMP_LTZ":
    case "TIMESTAMP_TZ":
      return `${family}(${type.precision})`;
    case "BOOLEAN":
    case "VARIANT":
    case "OBJECT":
    case "ARRAY":
    case "GEOGRAPHY":
    case "GEOMETRY":
      return family;
    case "VECTOR":
      if (type.element_type === null || type.dimension === null) return "VECTOR";
      return `VECTOR(${type.element_type}, ${type.dimension})`;
    default:
      fail(`unsupported family ${family}`);
  }
}

export function snowflakeTypeText(value) {
  const type = isRecord(value)
    ? canonicalizeSnowflakeType(value, { allowIncompleteVector: true })
    : canonicalizeSnowflakeType(value);
  return type.text;
}

export const canonicalSnowflakeTypeText = snowflakeTypeText;

function finish(type, label, { allowIncompleteVector = false } = {}) {
  if (!SUPPORTED_FAMILIES.has(type.family)) {
    fail(`unsupported family ${type.family}`, label);
  }
  const result = { ...type };
  if (result.family === "NUMBER") {
    if (result.precision === null) result.precision = 38;
    if (result.scale === null) result.scale = 0;
    if (
      result.precision < 1 ||
      result.precision > 38 ||
      result.scale < 0 ||
      result.scale > Math.min(37, result.precision)
    ) {
      fail(
        `precision must be 1..38 and scale must be 0..${Math.min(
          37,
          result.precision,
        )} for NUMBER`,
        label,
      );
    }
  } else if (result.family === "VARCHAR") {
    if (result.length === null) result.length = 16777216;
    if (result.length < 1 || result.length > 134217728) {
      fail("length must be between 1 and 134217728 for VARCHAR", label);
    }
  } else if (result.family === "BINARY") {
    if (result.length === null) result.length = 8388608;
    if (result.length < 1 || result.length > 67108864) {
      fail("length must be between 1 and 67108864 for BINARY", label);
    }
  } else if (
    result.family === "TIME" ||
    result.family === "TIMESTAMP_NTZ" ||
    result.family === "TIMESTAMP_LTZ" ||
    result.family === "TIMESTAMP_TZ"
  ) {
    if (result.precision === null) result.precision = 9;
    if (result.precision < 0 || result.precision > 9) {
      fail(`precision must be between 0 and 9 for ${result.family}`, label);
    }
  } else if (PARAMETERLESS_FAMILIES.has(result.family)) {
    if (
      result.precision !== null ||
      result.scale !== null ||
      result.length !== null ||
      result.element_type !== null ||
      result.dimension !== null
    ) {
      fail(`${result.family} does not support parameters`, label);
    }
  } else if (result.family === "VECTOR") {
    if (result.precision !== null || result.scale !== null || result.length !== null) {
      fail("precision, scale, and length must be null for VECTOR", label);
    }
    if (
      result.element_type !== null &&
      !new Set(["INT", "FLOAT"]).has(result.element_type)
    ) {
      fail("element_type must be INT or FLOAT for VECTOR", label);
    }
    if (
      result.dimension !== null &&
      (result.dimension < 1 || result.dimension > 4096)
    ) {
      fail("dimension must be between 1 and 4096 for VECTOR", label);
    }
    const incomplete =
      result.element_type === null || result.dimension === null;
    if (incomplete) {
      if (!allowIncompleteVector) {
        fail("VECTOR requires element_type INT or FLOAT and dimension 1..4096", label);
      }
    }
  }
  result.text = typeText(result);
  return result;
}

function canonicalFromExpression(expression, options = {}, label = "Snowflake type") {
  const { name, args } = splitTypeExpression(expression, label);
  const alias = aliasFor(name, label);
  let family = alias.family;
  if (family === "TIMESTAMP") {
    const mapping = normalizeTimestampMapping(options);
    if (!mapping) {
      fail("generic TIMESTAMP requires an explicit timestampTypeMapping", label);
    }
    const mapped = aliasFor(mapping, label);
    if (
      !new Set(["TIMESTAMP_NTZ", "TIMESTAMP_LTZ", "TIMESTAMP_TZ"]).has(
        mapped.family,
      )
    ) {
      fail("timestampTypeMapping must resolve to a concrete TIMESTAMP variant", label);
    }
    family = mapped.family;
  }

  const result = blankType(family);
  if (alias.fixedInteger) {
    if (args.length) fail(`${alias.alias} does not accept parameters`, label);
    result.precision = 38;
    result.scale = 0;
  } else if (family === "NUMBER") {
    if (args.length > 2) fail("NUMBER accepts at most two arguments", label);
    if (args.length >= 1) result.precision = integer(args[0], `${label}.precision`);
    if (args.length >= 2) result.scale = integer(args[1], `${label}.scale`);
  } else if (family === "VARCHAR") {
    if (args.length > 1) fail("VARCHAR accepts at most one argument", label);
    if (args.length === 1) result.length = integer(args[0], `${label}.length`);
    else result.length = alias.charDefault ? 1 : 16777216;
  } else if (family === "BINARY") {
    if (args.length > 1) fail("BINARY accepts at most one argument", label);
    result.length = args.length ? integer(args[0], `${label}.length`) : 8388608;
  } else if (
    family === "TIME" ||
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ"
  ) {
    if (args.length > 1) fail(`${family} accepts at most one argument`, label);
    result.precision = args.length ? integer(args[0], `${label}.precision`) : 9;
  } else if (family === "VECTOR") {
    if (args.length === 0) {
      if (options.allowIncompleteVector) {
        return finish(result, label, options);
      }
      fail("bare VECTOR is incomplete; element type and dimension are required", label);
    }
    if (args.length !== 2) fail("VECTOR requires element type and dimension", label);
    const element = normalizeWhitespace(args[0]);
    if (element !== "INT" && element !== "FLOAT") {
      fail("VECTOR element type must be INT or FLOAT", label);
    }
    result.element_type = element;
    result.dimension = integer(args[1], `${label}.dimension`);
  } else if (args.length || PARAMETERLESS_FAMILIES.has(family)) {
    if (args.length) fail(`${family} does not support parameters`, label);
  }
  return finish(result, label, options);
}

function canonicalFromObject(value, options = {}, label = "Snowflake type") {
  const rawFamily = value.family ?? value.type;
  if (rawFamily === undefined || rawFamily === null) {
    if (typeof value.text === "string") {
      return canonicalFromExpression(value.text, options, label);
    }
    fail("family is required", label);
  }
  const alias = aliasFor(rawFamily, label);
  let family = alias.family;
  if (family === "TIMESTAMP") {
    const mapping = normalizeTimestampMapping(options);
    if (!mapping) fail("generic TIMESTAMP requires an explicit timestampTypeMapping", label);
    const mapped = aliasFor(mapping, label);
    family = mapped.family;
    if (!new Set(["TIMESTAMP_NTZ", "TIMESTAMP_LTZ", "TIMESTAMP_TZ"]).has(family)) {
      fail("timestampTypeMapping must resolve to a concrete TIMESTAMP variant", label);
    }
  }

  const result = blankType(family);
  if (family === "NUMBER") {
    if (alias.fixedInteger) {
      if (value.precision != null || value.scale != null) {
        fail(`${alias.alias} does not accept parameters`, label);
      }
      result.precision = 38;
      result.scale = 0;
    } else {
      result.precision = optionalInteger(value.precision, `${label}.precision`);
      result.scale = optionalInteger(value.scale, `${label}.scale`);
    }
  } else if (family === "VARCHAR") {
    result.length = optionalInteger(value.length, `${label}.length`);
    if (result.length === null) result.length = alias.charDefault ? 1 : 16777216;
  } else if (family === "BINARY") {
    result.length = optionalInteger(value.length, `${label}.length`);
    if (result.length === null) result.length = 8388608;
  } else if (
    family === "TIME" ||
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ"
  ) {
    result.precision = optionalInteger(value.precision, `${label}.precision`);
    if (result.precision === null) result.precision = 9;
  } else if (family === "VECTOR") {
    result.element_type =
      value.element_type === undefined || value.element_type === null
        ? null
        : normalizeWhitespace(value.element_type);
    result.dimension = optionalInteger(value.dimension, `${label}.dimension`);
    if (
      result.element_type === null ||
      result.dimension === null
    ) {
      if (!options.allowIncompleteVector) {
        fail("VECTOR requires element_type INT or FLOAT and dimension 1..4096", label);
      }
    }
  } else if (PARAMETERLESS_FAMILIES.has(family)) {
    // Values are checked below.  Keeping this branch explicit makes it clear
    // that a non-null legacy parameter is not silently ignored.
  }

  const supplied = ["precision", "scale", "length", "element_type", "dimension"];
  for (const key of supplied) {
    const source = value[key];
    const canonical = result[key];
    if (
      source !== undefined &&
      source !== null &&
      canonical === null
    ) {
      fail(`${key} is not applicable to ${family}`, label);
    }
  }
  return finish(result, label, options);
}

/**
 * Normalize a supported Snowflake type string or legacy/object type into the
 * seven-key v2 shape.  `allowIncompleteVector` is intentionally opt-in: only
 * persistence/editor readers should use it for old bare VECTOR values.
 */
export function canonicalizeSnowflakeType(value, options = {}) {
  const label = options.label ?? "Snowflake type";
  if (typeof value === "string") {
    return canonicalFromExpression(value, options, label);
  }
  if (isRecord(value)) {
    return canonicalFromObject(value, options, label);
  }
  fail("must be a type string or object", label);
}

export const canonicalSnowflakeType = canonicalizeSnowflakeType;
export const normalizeSnowflakeType = canonicalizeSnowflakeType;
export const parseSnowflakeType = canonicalizeSnowflakeType;
export const parseSnowflakeDataType = canonicalizeSnowflakeType;
export const canonicalizeSnowflakeDataType = canonicalizeSnowflakeType;

/** Validate an already-canonical v2 object and return a defensive copy. */
export function validateSnowflakeType(value, options = {}) {
  const label = options.label ?? "data_type";
  if (!isRecord(value)) fail("must be an object", label);
  const keys = Object.keys(value).sort();
  const expected = [...TYPE_KEYS].sort();
  if (
    keys.length !== expected.length ||
    keys.some((key, index) => key !== expected[index])
  ) {
    fail("must contain exactly the seven canonical fields", label);
  }
  const canonical = canonicalizeSnowflakeType(value, {
    ...options,
    label,
    allowIncompleteVector: Boolean(options.allowIncompleteVector),
  });
  for (const key of TYPE_KEYS) {
    if (value[key] !== canonical[key]) {
      fail(`${key} must equal its canonical value ${JSON.stringify(canonical[key])}`, label);
    }
  }
  return canonical;
}

export const assertSnowflakeType = validateSnowflakeType;
export const validateCanonicalSnowflakeType = validateSnowflakeType;

export function isSnowflakeTypeComplete(value) {
  try {
    const canonical = canonicalizeSnowflakeType(value, {
      allowIncompleteVector: true,
      label: "Snowflake type",
    });
    return canonical.family !== "VECTOR" ||
      (canonical.element_type !== null && canonical.dimension !== null);
  } catch {
    return false;
  }
}

export const isCompleteSnowflakeType = isSnowflakeTypeComplete;
export function isIncompleteSnowflakeType(value) {
  try {
    const canonical = canonicalizeSnowflakeType(value, {
      allowIncompleteVector: true,
      label: "Snowflake type",
    });
    return (
      canonical.family === "VECTOR" &&
      (canonical.element_type === null || canonical.dimension === null)
    );
  } catch {
    return false;
  }
}

export function isSnowflakeTypeExportable(value) {
  try {
    assertSnowflakeTypeExportable(value);
    return true;
  } catch {
    return false;
  }
}

export const isExportableSnowflakeType = isSnowflakeTypeExportable;

export function assertSnowflakeTypeExportable(value, options = {}) {
  if (isRecord(value)) {
    return validateSnowflakeType(value, {
      ...options,
      allowIncompleteVector: false,
      label: options.label ?? "Snowflake type",
    });
  }
  return canonicalizeSnowflakeType(value, {
    ...options,
    allowIncompleteVector: false,
    label: options.label ?? "Snowflake type",
  });
}

/** Convert the editor's family + size transport into canonical Snowflake data. */
export function canonicalizeSnowflakeTypeFromField(field, options = {}) {
  if (!isRecord(field)) fail("field must be an object", "field");
  const label = options.label ?? `field ${field.name ?? "<unnamed>"}`;
  const allowIncompleteVector = options.allowIncompleteVector ?? true;
  const type = String(field.type ?? "").trim();
  if (!type) fail("type must be nonblank", label);
  const size = field.size;
  const hasSize = size !== undefined && size !== null && String(size).trim() !== "";
  const alias = aliasFor(type, label);
  if (alias.fixedInteger && hasSize) {
    fail(`${alias.alias} does not accept parameters`, label);
  }
  if (alias.family === "VECTOR") {
    if (!hasSize) {
      return canonicalFromExpression("VECTOR", {
        ...options,
        allowIncompleteVector,
      }, label);
    }
    const text = String(size).trim();
    const expression = /^VECTOR\s*\(/i.test(text) ? text : `VECTOR(${text})`;
    return canonicalFromExpression(expression, {
      ...options,
      allowIncompleteVector,
    }, label);
  }
  if (!hasSize) return canonicalFromExpression(type, options, label);
  return canonicalFromExpression(`${type}(${String(size).trim()})`, options, label);
}

export const snowflakeTypeFromField = canonicalizeSnowflakeTypeFromField;

export function snowflakeTypeSize(typeValue) {
  const type = canonicalizeSnowflakeType(typeValue, {
    allowIncompleteVector: true,
    label: "Snowflake type",
  });
  if (type.family === "NUMBER") return `${type.precision},${type.scale}`;
  if (type.family === "VARCHAR" || type.family === "BINARY") return type.length;
  if (
    type.family === "TIME" ||
    type.family === "TIMESTAMP_NTZ" ||
    type.family === "TIMESTAMP_LTZ" ||
    type.family === "TIMESTAMP_TZ"
  ) return type.precision;
  if (type.family === "VECTOR") {
    if (type.element_type === null || type.dimension === null) return "";
    return `${type.element_type},${type.dimension}`;
  }
  return undefined;
}

export const fieldSizeFromSnowflakeType = snowflakeTypeSize;
