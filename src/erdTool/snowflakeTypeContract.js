function fail(message) {
  throw new Error(message);
}

export const SNOWFLAKE_TYPE_FAMILIES = Object.freeze([
  "NUMBER",
  "FLOAT",
  "VARCHAR",
  "DATE",
  "TIME",
  "TIMESTAMP_NTZ",
  "TIMESTAMP_LTZ",
  "TIMESTAMP_TZ",
  "BOOLEAN",
  "BINARY",
  "VARIANT",
  "OBJECT",
  "ARRAY",
  "GEOGRAPHY",
  "GEOMETRY",
  "VECTOR",
]);

export const SNOWFLAKE_TYPE_ALIASES = Object.freeze({
  DECIMAL: "NUMBER",
  DEC: "NUMBER",
  NUMERIC: "NUMBER",
  INT: "NUMBER",
  INTEGER: "NUMBER",
  BIGINT: "NUMBER",
  SMALLINT: "NUMBER",
  TINYINT: "NUMBER",
  BYTEINT: "NUMBER",

  FLOAT4: "FLOAT",
  FLOAT8: "FLOAT",
  DOUBLE: "FLOAT",
  "DOUBLE PRECISION": "FLOAT",
  REAL: "FLOAT",

  STRING: "VARCHAR",
  TEXT: "VARCHAR",
  VARCHAR2: "VARCHAR",
  NVARCHAR: "VARCHAR",
  NVARCHAR2: "VARCHAR",
  "CHAR VARYING": "VARCHAR",
  "NCHAR VARYING": "VARCHAR",
  CHAR: "VARCHAR",
  CHARACTER: "VARCHAR",
  NCHAR: "VARCHAR",

  VARBINARY: "BINARY",

  TIMESTAMP: "TIMESTAMP_NTZ",
  TIMESTAMPNTZ: "TIMESTAMP_NTZ",
  "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP_NTZ",
  DATETIME: "TIMESTAMP_NTZ",

  TIMESTAMPLTZ: "TIMESTAMP_LTZ",
  "TIMESTAMP WITH LOCAL TIME ZONE": "TIMESTAMP_LTZ",

  TIMESTAMPTZ: "TIMESTAMP_TZ",
  "TIMESTAMP WITH TIME ZONE": "TIMESTAMP_TZ",
});

export const SNOWFLAKE_TYPE_BOUNDS = Object.freeze({
  NUMBER: Object.freeze({
    minPrecision: 1,
    maxPrecision: 38,
    defaultPrecision: 38,
    minScale: 0,
    maxScale: 37,
    defaultScale: 0,
    precision: Object.freeze({ min: 1, max: 38, default: 38 }),
    scale: Object.freeze({ min: 0, max: 37, default: 0 }),
  }),
  VARCHAR: Object.freeze({
    minLength: 1,
    maxLength: 134217728,
    defaultLength: 16777216,
    charDefaultLength: 1,
    length: Object.freeze({
      min: 1,
      max: 134217728,
      default: 16777216,
      charDefault: 1,
    }),
  }),
  BINARY: Object.freeze({
    minLength: 1,
    maxLength: 67108864,
    defaultLength: 8388608,
    length: Object.freeze({
      min: 1,
      max: 67108864,
      default: 8388608,
    }),
  }),
  TIME: Object.freeze({
    minPrecision: 0,
    maxPrecision: 9,
    defaultPrecision: 9,
    precision: Object.freeze({ min: 0, max: 9, default: 9 }),
  }),
  TIMESTAMP_NTZ: Object.freeze({
    minPrecision: 0,
    maxPrecision: 9,
    defaultPrecision: 9,
    precision: Object.freeze({ min: 0, max: 9, default: 9 }),
  }),
  TIMESTAMP_LTZ: Object.freeze({
    minPrecision: 0,
    maxPrecision: 9,
    defaultPrecision: 9,
    precision: Object.freeze({ min: 0, max: 9, default: 9 }),
  }),
  TIMESTAMP_TZ: Object.freeze({
    minPrecision: 0,
    maxPrecision: 9,
    defaultPrecision: 9,
    precision: Object.freeze({ min: 0, max: 9, default: 9 }),
  }),
  VECTOR: Object.freeze({
    minDimension: 1,
    maxDimension: 4096,
    elements: Object.freeze(["INT", "FLOAT"]),
    elementTypes: Object.freeze(["INT", "FLOAT"]),
    dimension: Object.freeze({ min: 1, max: 4096 }),
  }),
});

const CANONICAL_KEYS = new Set([
  "family",
  "text",
  "precision",
  "scale",
  "length",
  "vector_element_type",
  "vector_dimension",
]);

const INTEGER_ALIASES = new Set([
  "INT",
  "INTEGER",
  "BIGINT",
  "SMALLINT",
  "TINYINT",
  "BYTEINT",
]);

const FLOAT_NAMES = new Set([
  "FLOAT",
  "FLOAT4",
  "FLOAT8",
  "DOUBLE",
  "DOUBLE PRECISION",
  "REAL",
]);

const CHAR_ALIASES = new Set(["CHAR", "CHARACTER", "NCHAR"]);

const VARCHAR_NAMES = new Set([
  "VARCHAR",
  "STRING",
  "TEXT",
  "VARCHAR2",
  "NVARCHAR",
  "NVARCHAR2",
  "CHAR VARYING",
  "NCHAR VARYING",
]);

const BINARY_NAMES = new Set(["BINARY", "VARBINARY"]);

const NUMBER_NAMES = new Set(["NUMBER", "DECIMAL", "DEC", "NUMERIC"]);

const TIME_MAPPINGS = {
  TIME: "TIME",
  TIMESTAMP_NTZ: "TIMESTAMP_NTZ",
  TIMESTAMPNTZ: "TIMESTAMP_NTZ",
  "TIMESTAMP WITHOUT TIME ZONE": "TIMESTAMP_NTZ",
  DATETIME: "TIMESTAMP_NTZ",
  TIMESTAMP_LTZ: "TIMESTAMP_LTZ",
  TIMESTAMPLTZ: "TIMESTAMP_LTZ",
  "TIMESTAMP WITH LOCAL TIME ZONE": "TIMESTAMP_LTZ",
  TIMESTAMP_TZ: "TIMESTAMP_TZ",
  TIMESTAMPTZ: "TIMESTAMP_TZ",
  "TIMESTAMP WITH TIME ZONE": "TIMESTAMP_TZ",
};

const PARAMETERLESS_FAMILIES = new Set([
  "DATE",
  "BOOLEAN",
  "VARIANT",
  "OBJECT",
  "ARRAY",
  "GEOGRAPHY",
  "GEOMETRY",
]);

const UNSUPPORTED_TYPES = new Set(["DECFLOAT", "MAP", "FILE", "UUID"]);

function validateTimestampMapping(options) {
  let timestampMapping = "TIMESTAMP_NTZ";
  if (options && options.timestampTypeMapping !== undefined) {
    const m = String(options.timestampTypeMapping).trim().toUpperCase();
    if (
      m !== "TIMESTAMP_NTZ" &&
      m !== "TIMESTAMP_LTZ" &&
      m !== "TIMESTAMP_TZ"
    ) {
      fail(`invalid timestampTypeMapping: ${options.timestampTypeMapping}`);
    }
    timestampMapping = m;
  }
  return timestampMapping;
}

function parseIntegerArg(raw, min, max, paramName, family) {
  const trimmed = raw.trim();
  if (!/^-?\d+$/.test(trimmed)) {
    fail(`${paramName} must be an integer between ${min} and ${max} for ${family}`);
  }
  const val = Number(trimmed);
  if (!Number.isSafeInteger(val) || val < min || val > max) {
    fail(`${paramName} must be between ${min} and ${max} for ${family}`);
  }
  return val;
}

function parseFieldInteger(value, min, max, paramName, family) {
  const num = Number(value);
  if (!Number.isInteger(num)) {
    fail(`${paramName} must be an integer between ${min} and ${max} for ${family}`);
  }
  if (num < min || num > max) {
    fail(`${paramName} must be between ${min} and ${max} for ${family}`);
  }
  return num;
}

export function snowflakeTypeText(type) {
  if (!type || typeof type !== "object") {
    fail("type must be an object");
  }
  const family = type.family;
  switch (family) {
    case "NUMBER":
      if (type.precision === null && type.scale === null) {
        return "NUMBER";
      }
      return `NUMBER(${type.precision}, ${type.scale})`;
    case "VARCHAR":
      return type.length === null ? "VARCHAR" : `VARCHAR(${type.length})`;
    case "DATE":
      return "DATE";
    case "TIME":
    case "TIMESTAMP_NTZ":
    case "TIMESTAMP_LTZ":
    case "TIMESTAMP_TZ":
      return type.precision === null ? family : `${family}(${type.precision})`;
    case "BOOLEAN":
    case "FLOAT":
      return family;
    case "BINARY":
      return type.length === null ? "BINARY" : `BINARY(${type.length})`;
    case "VARIANT":
    case "OBJECT":
    case "ARRAY":
    case "GEOGRAPHY":
    case "GEOMETRY":
      return family;
    case "VECTOR":
      if (
        type.vector_element_type !== null &&
        type.vector_dimension !== null
      ) {
        return `VECTOR(${type.vector_element_type}, ${type.vector_dimension})`;
      }
      return "VECTOR";
    default:
      fail(`unsupported type family ${family}`);
  }
}

export function isSnowflakeTypeComplete(type) {
  if (!type || typeof type !== "object") {
    return false;
  }
  if (type.family === "VECTOR") {
    return type.vector_element_type !== null && type.vector_dimension !== null;
  }
  return true;
}

export function validateSnowflakeType(type) {
  if (!type || typeof type !== "object" || Array.isArray(type)) {
    fail("type must be an object");
  }
  const keys = Object.keys(type);
  for (const k of keys) {
    if (!CANONICAL_KEYS.has(k)) {
      fail(`type has unexpected field ${k}`);
    }
  }
  for (const k of CANONICAL_KEYS) {
    if (!(k in type)) {
      fail(`type is missing required ${k}`);
    }
  }

  const family = type.family;
  if (typeof family !== "string" || !SNOWFLAKE_TYPE_FAMILIES.includes(family)) {
    fail(`unsupported type family ${family}`);
  }

  const {
    precision,
    scale,
    length,
    vector_element_type,
    vector_dimension,
    text,
  } = type;

  if (
    precision !== null &&
    (!Number.isInteger(precision) || typeof precision !== "number")
  ) {
    fail("precision must be an integer or null");
  }
  if (
    scale !== null &&
    (!Number.isInteger(scale) || typeof scale !== "number")
  ) {
    fail("scale must be an integer or null");
  }
  if (
    length !== null &&
    (!Number.isInteger(length) || typeof length !== "number")
  ) {
    fail("length must be an integer or null");
  }
  if (
    vector_element_type !== null &&
    typeof vector_element_type !== "string"
  ) {
    fail("vector_element_type must be a string or null");
  }
  if (
    vector_dimension !== null &&
    (!Number.isInteger(vector_dimension) || typeof vector_dimension !== "number")
  ) {
    fail("vector_dimension must be an integer or null");
  }
  if (typeof text !== "string" || !text.trim()) {
    fail("text must be a nonblank string");
  }

  // Non-VECTOR families
  if (family !== "VECTOR") {
    if (vector_element_type !== null || vector_dimension !== null) {
      fail(`vector_element_type and vector_dimension must be null for ${family}`);
    }
  }

  // Bounds & null-ness rules per family
  if (family === "NUMBER") {
    if (precision === null) {
      fail("precision is required for NUMBER");
    }
    if (scale === null) {
      fail("scale is required for NUMBER");
    }
    if (length !== null) {
      fail("length must be null for NUMBER");
    }
    if (precision < 1 || precision > 38) {
      fail("precision must be between 1 and 38 for NUMBER");
    }
    const maxScale = Math.min(37, precision);
    if (scale < 0 || scale > maxScale) {
      fail(`scale must be between 0 and ${maxScale} for NUMBER`);
    }
  } else if (family === "VARCHAR") {
    if (precision !== null || scale !== null) {
      fail("precision and scale must be null for VARCHAR");
    }
    if (length !== null && (length < 1 || length > 134217728)) {
      fail("length must be between 1 and 134217728 for VARCHAR");
    }
  } else if (family === "BINARY") {
    if (length === null) {
      fail("length is required for BINARY");
    }
    if (precision !== null || scale !== null) {
      fail("precision and scale must be null for BINARY");
    }
    if (length < 1 || length > 67108864) {
      fail("length must be between 1 and 67108864 for BINARY");
    }
  } else if (
    family === "TIME" ||
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ"
  ) {
    if (precision === null) {
      fail(`precision is required for ${family}`);
    }
    if (scale !== null || length !== null) {
      fail(`scale and length must be null for ${family}`);
    }
    if (precision < 0 || precision > 9) {
      fail(`precision must be between 0 and 9 for ${family}`);
    }
  } else if (family === "VECTOR") {
    if (precision !== null || scale !== null || length !== null) {
      fail("precision, scale, and length must be null for VECTOR");
    }
    const elem = vector_element_type;
    const dim = vector_dimension;
    if (elem === null && dim === null) {
      if (text !== "VECTOR") {
        fail('text must equal "VECTOR" for unresolved VECTOR');
      }
    } else if (elem !== null && dim !== null) {
      if (elem !== "INT" && elem !== "FLOAT") {
        fail("vector_element_type must be INT or FLOAT for VECTOR");
      }
      if (dim < 1 || dim > 4096) {
        fail("vector_dimension must be between 1 and 4096 for VECTOR");
      }
    } else {
      fail("VECTOR requires both vector_element_type and vector_dimension or neither");
    }
  } else {
    // DATE, BOOLEAN, FLOAT, VARIANT, OBJECT, ARRAY, GEOGRAPHY, GEOMETRY
    if (precision !== null || scale !== null || length !== null) {
      fail(`precision, scale, and length must be null for ${family}`);
    }
  }

  const expectedText = snowflakeTypeText(type);
  if (text !== expectedText) {
    fail(`text must equal ${JSON.stringify(expectedText)}`);
  }

  return {
    family,
    text,
    precision,
    scale,
    length,
    vector_element_type,
    vector_dimension,
  };
}

export function canonicalizeSnowflakeType(text, options = {}) {
  const timestampMapping = validateTimestampMapping(options);

  if (typeof text !== "string" || !text.trim()) {
    fail(`unsupported Snowflake data type ${text}`);
  }
  const trimmed = text.trim();

  const parenOpen = trimmed.indexOf("(");
  let rawName;
  let rawArgs;
  if (parenOpen === -1) {
    if (trimmed.includes(")")) {
      fail(`unsupported Snowflake data type ${text}`);
    }
    rawName = trimmed;
    rawArgs = null;
  } else {
    if (parenOpen === 0 || !trimmed.endsWith(")")) {
      fail(`unsupported Snowflake data type ${text}`);
    }
    rawName = trimmed.slice(0, parenOpen).trim();
    rawArgs = trimmed.slice(parenOpen + 1, -1);
  }

  if (rawArgs !== null && (rawArgs.includes("(") || rawArgs.includes(")"))) {
    fail(`unsupported structured type ${text}`);
  }

  const normalizedName = rawName.replace(/\s+/g, " ").toUpperCase();
  if (
    (normalizedName === "OBJECT" || normalizedName === "ARRAY") &&
    rawArgs !== null
  ) {
    fail(`unsupported structured type ${text}`);
  }

  if (UNSUPPORTED_TYPES.has(normalizedName)) {
    fail(`unsupported data type ${text}`);
  }

  let args = [];
  if (rawArgs !== null) {
    if (rawArgs.trim() === "") {
      fail(`malformed arguments in ${text}`);
    }
    args = rawArgs.split(",").map((a) => a.trim());
    if (args.some((a) => a === "")) {
      fail(`malformed arguments in ${text}`);
    }
  }

  if (INTEGER_ALIASES.has(normalizedName)) {
    if (args.length > 0) {
      fail(`integer type ${normalizedName} does not accept arguments`);
    }
    return {
      family: "NUMBER",
      text: "NUMBER(38, 0)",
      precision: 38,
      scale: 0,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (FLOAT_NAMES.has(normalizedName)) {
    if (args.length > 0) {
      fail(`FLOAT type ${normalizedName} does not accept arguments`);
    }
    return {
      family: "FLOAT",
      text: "FLOAT",
      precision: null,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (CHAR_ALIASES.has(normalizedName)) {
    if (args.length > 1) {
      fail("CHAR accepts at most 1 argument");
    }
    let length;
    if (args.length === 0) {
      length = 1;
    } else {
      length = parseIntegerArg(args[0], 1, 134217728, "length", "VARCHAR");
    }
    return {
      family: "VARCHAR",
      text: `VARCHAR(${length})`,
      precision: null,
      scale: null,
      length,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (VARCHAR_NAMES.has(normalizedName)) {
    if (args.length > 1) {
      fail("VARCHAR accepts at most 1 argument");
    }
    let length;
    if (args.length === 0) {
      length = 16777216;
    } else {
      length = parseIntegerArg(args[0], 1, 134217728, "length", "VARCHAR");
    }
    return {
      family: "VARCHAR",
      text: `VARCHAR(${length})`,
      precision: null,
      scale: null,
      length,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (BINARY_NAMES.has(normalizedName)) {
    if (args.length > 1) {
      fail("BINARY accepts at most 1 argument");
    }
    let length;
    if (args.length === 0) {
      length = 8388608;
    } else {
      length = parseIntegerArg(args[0], 1, 67108864, "length", "BINARY");
    }
    return {
      family: "BINARY",
      text: `BINARY(${length})`,
      precision: null,
      scale: null,
      length,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (NUMBER_NAMES.has(normalizedName)) {
    if (args.length > 2) {
      fail("NUMBER accepts at most 2 arguments");
    }
    let precision = 38;
    let scale = 0;
    if (args.length === 1) {
      precision = parseIntegerArg(args[0], 1, 38, "precision", "NUMBER");
      scale = 0;
    } else if (args.length === 2) {
      precision = parseIntegerArg(args[0], 1, 38, "precision", "NUMBER");
      const maxScale = Math.min(37, precision);
      scale = parseIntegerArg(args[1], 0, maxScale, "scale", "NUMBER");
    }
    return {
      family: "NUMBER",
      text: `NUMBER(${precision}, ${scale})`,
      precision,
      scale,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (normalizedName === "TIMESTAMP") {
    const family = timestampMapping;
    if (args.length > 1) {
      fail(`${family} accepts at most 1 argument`);
    }
    const precision =
      args.length === 0
        ? 9
        : parseIntegerArg(args[0], 0, 9, "precision", family);
    return {
      family,
      text: `${family}(${precision})`,
      precision,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (normalizedName in TIME_MAPPINGS) {
    const family = TIME_MAPPINGS[normalizedName];
    if (args.length > 1) {
      fail(`${family} accepts at most 1 argument`);
    }
    const precision =
      args.length === 0
        ? 9
        : parseIntegerArg(args[0], 0, 9, "precision", family);
    return {
      family,
      text: `${family}(${precision})`,
      precision,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  if (normalizedName === "VECTOR") {
    if (args.length !== 2) {
      fail("VECTOR requires exactly 2 arguments: element type and dimension");
    }
    const elem = args[0].toUpperCase();
    if (elem !== "INT" && elem !== "FLOAT") {
      fail("VECTOR element type must be INT or FLOAT");
    }
    const dim = parseIntegerArg(args[1], 1, 4096, "dimension", "VECTOR");
    return {
      family: "VECTOR",
      text: `VECTOR(${elem}, ${dim})`,
      precision: null,
      scale: null,
      length: null,
      vector_element_type: elem,
      vector_dimension: dim,
    };
  }

  if (PARAMETERLESS_FAMILIES.has(normalizedName)) {
    if (args.length > 0) {
      fail(`${normalizedName} does not accept arguments`);
    }
    return {
      family: normalizedName,
      text: normalizedName,
      precision: null,
      scale: null,
      length: null,
      vector_element_type: null,
      vector_dimension: null,
    };
  }

  fail(`unsupported Snowflake data type ${text}`);
}

export function snowflakeTypeFromField(field, options = {}) {
  const timestampMapping = validateTimestampMapping(options);

  if (!field || typeof field !== "object" || Array.isArray(field)) {
    fail("field must be an object");
  }
  if (typeof field.type !== "string" || !field.type.trim()) {
    fail("field.type must be a nonblank string");
  }

  const rawType = field.type.trim().replace(/\s+/g, " ").toUpperCase();
  let family;
  if (rawType === "TIMESTAMP") {
    family = timestampMapping;
  } else if (rawType in SNOWFLAKE_TYPE_ALIASES) {
    family = SNOWFLAKE_TYPE_ALIASES[rawType];
  } else if (SNOWFLAKE_TYPE_FAMILIES.includes(rawType)) {
    family = rawType;
  } else {
    fail(`unsupported field type ${field.type}`);
  }

  const size = field.size;
  const label = field.name ? `field ${field.name}` : "field";
  let precision = null;
  let scale = null;
  let length = null;
  let vectorElementType = null;
  let vectorDimension = null;

  if (INTEGER_ALIASES.has(rawType)) {
    if (size !== undefined && size !== null && size !== "") {
      fail(`${rawType} ${label} must remain parameterless`);
    }
    precision = 38;
    scale = 0;
  } else if (CHAR_ALIASES.has(rawType)) {
    if (size === undefined || size === null || size === "") {
      length = 1;
    } else {
      length = parseFieldInteger(size, 1, 134217728, "length", "VARCHAR");
    }
  } else if (family === "NUMBER") {
    if (size === undefined || size === null || size === "") {
      fail(`NUMBER ${label} requires size`);
    }
    const parts = String(size)
      .split(",")
      .map((part) => part.trim());
    if (
      parts.length !== 2 ||
      parts.some((part) => part === "" || Number.isNaN(Number(part)))
    ) {
      fail(`NUMBER ${label} has malformed size ${JSON.stringify(size)}`);
    }
    precision = Number(parts[0]);
    scale = Number(parts[1]);
    if (!Number.isInteger(precision) || !Number.isInteger(scale)) {
      fail(`NUMBER ${label} size must be integers`);
    }
    if (precision < 1 || precision > 38) {
      fail("precision must be between 1 and 38 for NUMBER");
    }
    const maxScale = Math.min(37, precision);
    if (scale < 0 || scale > maxScale) {
      fail(`scale must be between 0 and ${maxScale} for NUMBER`);
    }
  } else if (family === "VARCHAR") {
    if (size === undefined || size === null || size === "") {
      length = 16777216;
    } else {
      length = parseFieldInteger(size, 1, 134217728, "length", "VARCHAR");
    }
  } else if (family === "BINARY") {
    if (size === undefined || size === null || size === "") {
      length = 8388608;
    } else {
      length = parseFieldInteger(size, 1, 67108864, "length", "BINARY");
    }
  } else if (
    family === "TIME" ||
    family === "TIMESTAMP_NTZ" ||
    family === "TIMESTAMP_LTZ" ||
    family === "TIMESTAMP_TZ"
  ) {
    if (size === undefined || size === null || size === "") {
      precision = 9;
    } else {
      precision = parseFieldInteger(size, 0, 9, "precision", family);
    }
  } else if (family === "VECTOR") {
    if (
      size === undefined ||
      size === null ||
      (typeof size === "string" && size.trim() === "")
    ) {
      vectorElementType = null;
      vectorDimension = null;
    } else if (typeof size === "string") {
      const parts = size.split(",").map((part) => part.trim());
      if (parts.length !== 2) {
        fail(`invalid size for VECTOR: ${JSON.stringify(size)}`);
      }
      const elem = parts[0].toUpperCase();
      if (elem !== "INT" && elem !== "FLOAT") {
        fail("VECTOR element type must be INT or FLOAT");
      }
      const dim = Number(parts[1]);
      if (!Number.isInteger(dim) || dim < 1 || dim > 4096) {
        fail("dimension must be between 1 and 4096 for VECTOR");
      }
      vectorElementType = elem;
      vectorDimension = dim;
    } else {
      fail(`invalid size for VECTOR: ${JSON.stringify(size)}`);
    }
  } else {
    if (size !== undefined && size !== null && size !== "") {
      fail(`${family} ${label} must remain parameterless`);
    }
  }

  const text = snowflakeTypeText({
    family,
    precision,
    scale,
    length,
    vector_element_type: vectorElementType,
    vector_dimension: vectorDimension,
  });

  return {
    family,
    text,
    precision,
    scale,
    length,
    vector_element_type: vectorElementType,
    vector_dimension: vectorDimension,
  };
}

export function snowflakeTypeSize(type) {
  if (!type || typeof type !== "object") {
    fail("type must be an object");
  }
  switch (type.family) {
    case "NUMBER":
      return `${type.precision},${type.scale}`;
    case "VARCHAR":
    case "BINARY":
      return type.length ?? undefined;
    case "TIME":
    case "TIMESTAMP_NTZ":
    case "TIMESTAMP_LTZ":
    case "TIMESTAMP_TZ":
      return type.precision ?? undefined;
    case "VECTOR":
      if (
        type.vector_element_type !== null &&
        type.vector_dimension !== null
      ) {
        return `${type.vector_element_type},${type.vector_dimension}`;
      }
      return "";
    case "DATE":
    case "FLOAT":
    case "BOOLEAN":
    case "VARIANT":
    case "OBJECT":
    case "ARRAY":
    case "GEOGRAPHY":
    case "GEOMETRY":
      return undefined;
    default:
      fail(`unsupported type family ${type.family}`);
  }
}
