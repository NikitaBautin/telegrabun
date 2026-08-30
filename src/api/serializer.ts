import { telegramApiMetadata } from '../generated/metadata.ts';
import type {
  TelegramApiRuntimeField,
  TelegramApiRuntimeMetadata,
  TelegramApiRuntimeType,
} from '../generated/metadata.ts';
import type { ApiMethodName, ApiMethodParams, ApiMethodResult } from '../generated/public.ts';

/** Raised when a typed Bot API value cannot be mapped to an unambiguous wire value. */
export class TelegramSerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TelegramSerializationError';
  }
}

/**
 * Converts public camelCase method parameters to Telegram's snake_case JSON shape.
 *
 * Only fields described by the generated metadata are accepted. This makes JavaScript
 * callers get the same typo protection as TypeScript callers; newly introduced Bot API
 * fields remain available through the raw API escape hatch.
 */
export function serializeApiMethodParams<Method extends ApiMethodName>(
  method: Method,
  params: ApiMethodParams<Method>,
  metadata: TelegramApiRuntimeMetadata = telegramApiMetadata,
): Record<string, unknown> {
  const definition = metadata.methods[method];
  if (definition === undefined) {
    throw new TelegramSerializationError(`Unknown Telegram method metadata: ${method}.`);
  }

  return serializeObject(params, definition.parameters, metadata, `method ${method}`);
}

/**
 * Converts a Telegram wire result to the public camelCase shape.
 *
 * Unknown response properties are intentionally copied unchanged. Telegram can add
 * response fields ahead of a schema update without making the value lossy for callers.
 */
export function deserializeApiMethodResult<Method extends ApiMethodName>(
  method: Method,
  result: unknown,
  metadata: TelegramApiRuntimeMetadata = telegramApiMetadata,
): ApiMethodResult<Method> {
  const definition = metadata.methods[method];
  if (definition === undefined) {
    throw new TelegramSerializationError(`Unknown Telegram method metadata: ${method}.`);
  }

  return deserializeValue(
    result,
    definition.result,
    metadata,
    `method ${method} result`,
  ) as ApiMethodResult<Method>;
}

function serializeObject(
  value: unknown,
  fields: readonly TelegramApiRuntimeField[],
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): Record<string, unknown> {
  const record = requireRecord(value, path);
  const fieldTable = createFieldTable(fields, path);

  for (const name of Object.keys(record)) {
    if (!fieldTable.byName.has(name)) {
      const wireField = fieldTable.byWireName.get(name);
      if (wireField !== undefined) {
        throw new TelegramSerializationError(
          `${path} contains wire field ${JSON.stringify(name)}. Use ${JSON.stringify(wireField.name)} instead.`,
        );
      }
      throw new TelegramSerializationError(
        `${path} contains unknown field ${JSON.stringify(name)}.`,
      );
    }
  }

  const output: Record<string, unknown> = {};
  for (const field of fields) {
    const fieldValue = record[field.name];
    if (fieldValue === undefined) {
      if (field.required) {
        throw new TelegramSerializationError(
          `${path} is missing required field ${JSON.stringify(field.name)}.`,
        );
      }
      continue;
    }
    defineValue(
      output,
      field.wireName,
      serializeValue(fieldValue, field.type, metadata, `${path}.${field.name}`),
      path,
    );
  }
  return output;
}

function serializeValue(
  value: unknown,
  type: TelegramApiRuntimeType,
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): unknown {
  switch (type.kind) {
    case 'array':
      if (!Array.isArray(value)) {
        throw new TelegramSerializationError(`${path} must be an array.`);
      }
      return value.map((item, index) =>
        serializeValue(item, type.element, metadata, `${path}[${index}]`),
      );
    case 'input-file':
    case 'literal':
    case 'primitive':
      return value;
    case 'reference': {
      const object = metadata.objects[type.name];
      if (object !== undefined) {
        return serializeObject(value, object.fields, metadata, path);
      }
      const union = metadata.unions[type.name];
      if (union !== undefined) {
        return serializeUnionObject(value, union.members, metadata, path);
      }
      throw new TelegramSerializationError(
        `${path} references unknown type ${JSON.stringify(type.name)}.`,
      );
    }
    case 'union':
      return serializeUnionValue(value, type.members, metadata, path);
  }
}

function serializeUnionValue(
  value: unknown,
  members: readonly TelegramApiRuntimeType[],
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const fields = collectObjectFields(members, metadata);
  return fields.length === 0 ? value : serializeObject(value, fields, metadata, path);
}

function serializeUnionObject(
  value: unknown,
  members: readonly TelegramApiRuntimeType[],
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): Record<string, unknown> {
  return serializeObject(value, collectObjectFields(members, metadata), metadata, path);
}

function deserializeValue(
  value: unknown,
  type: TelegramApiRuntimeType,
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): unknown {
  switch (type.kind) {
    case 'array':
      return Array.isArray(value)
        ? value.map((item, index) =>
            deserializeValue(item, type.element, metadata, `${path}[${index}]`),
          )
        : value;
    case 'input-file':
    case 'literal':
    case 'primitive':
      return value;
    case 'reference': {
      const object = metadata.objects[type.name];
      if (object !== undefined) {
        return deserializeObject(value, object.fields, metadata, path);
      }
      const union = metadata.unions[type.name];
      if (union !== undefined) {
        return deserializeUnionObject(value, union.members, metadata, path);
      }
      throw new TelegramSerializationError(
        `${path} references unknown type ${JSON.stringify(type.name)}.`,
      );
    }
    case 'union':
      return deserializeUnionValue(value, type.members, metadata, path);
  }
}

function deserializeUnionValue(
  value: unknown,
  members: readonly TelegramApiRuntimeType[],
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): unknown {
  if (!isRecord(value)) return value;
  const fields = collectObjectFields(members, metadata);
  return fields.length === 0 ? value : deserializeObject(value, fields, metadata, path);
}

function deserializeUnionObject(
  value: unknown,
  members: readonly TelegramApiRuntimeType[],
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): unknown {
  return deserializeObject(value, collectObjectFields(members, metadata), metadata, path);
}

function deserializeObject(
  value: unknown,
  fields: readonly TelegramApiRuntimeField[],
  metadata: TelegramApiRuntimeMetadata,
  path: string,
): unknown {
  if (!isRecord(value)) return value;

  const fieldTable = createFieldTable(fields, path);
  const output: Record<string, unknown> = {};
  for (const [name, fieldValue] of Object.entries(value)) {
    const field = fieldTable.byWireName.get(name);
    if (field === undefined) {
      defineValue(output, name, fieldValue, path);
      continue;
    }
    defineValue(
      output,
      field.name,
      deserializeValue(fieldValue, field.type, metadata, `${path}.${field.name}`),
      path,
    );
  }
  return output;
}

function collectObjectFields(
  types: readonly TelegramApiRuntimeType[],
  metadata: TelegramApiRuntimeMetadata,
  visitedReferences: ReadonlySet<string> = new Set<string>(),
): readonly TelegramApiRuntimeField[] {
  const fields = types.flatMap((type) => collectFieldsFromType(type, metadata, visitedReferences));
  return mergeUnionFields(fields);
}

function collectFieldsFromType(
  type: TelegramApiRuntimeType,
  metadata: TelegramApiRuntimeMetadata,
  visitedReferences: ReadonlySet<string>,
): readonly TelegramApiRuntimeField[] {
  if (type.kind === 'union') {
    return collectObjectFields(type.members, metadata, visitedReferences);
  }
  if (type.kind !== 'reference' || visitedReferences.has(type.name)) return [];

  const object = metadata.objects[type.name];
  if (object !== undefined) return object.fields;

  const union = metadata.unions[type.name];
  if (union === undefined) {
    throw new TelegramSerializationError(
      `Runtime metadata references unknown union ${JSON.stringify(type.name)}.`,
    );
  }
  return collectObjectFields(union.members, metadata, new Set(visitedReferences).add(type.name));
}

function mergeUnionFields(
  fields: readonly TelegramApiRuntimeField[],
): readonly TelegramApiRuntimeField[] {
  const byName = new Map<string, TelegramApiRuntimeField>();
  const byWireName = new Map<string, TelegramApiRuntimeField>();

  for (const field of fields) {
    const sameName = byName.get(field.name);
    const sameWireName = byWireName.get(field.wireName);
    if (sameName !== undefined && sameName.wireName !== field.wireName) {
      throw new TelegramSerializationError(
        `Runtime metadata maps public field ${JSON.stringify(field.name)} to both ${JSON.stringify(sameName.wireName)} and ${JSON.stringify(field.wireName)}.`,
      );
    }
    if (sameWireName !== undefined && sameWireName.name !== field.name) {
      throw new TelegramSerializationError(
        `Runtime metadata maps wire field ${JSON.stringify(field.wireName)} to both ${JSON.stringify(sameWireName.name)} and ${JSON.stringify(field.name)}.`,
      );
    }
    if (sameName === undefined) {
      const mergedField = { ...field, required: false };
      byName.set(mergedField.name, mergedField);
      byWireName.set(mergedField.wireName, mergedField);
    }
  }

  return [...byName.values()];
}

function createFieldTable(fields: readonly TelegramApiRuntimeField[], path: string): FieldTable {
  const byName = new Map<string, TelegramApiRuntimeField>();
  const byWireName = new Map<string, TelegramApiRuntimeField>();
  for (const field of fields) {
    const existingName = byName.get(field.name);
    if (existingName !== undefined) {
      throw new TelegramSerializationError(
        `${path} has a public-name collision for ${JSON.stringify(field.name)} (${JSON.stringify(existingName.wireName)} and ${JSON.stringify(field.wireName)}).`,
      );
    }
    const existingWireName = byWireName.get(field.wireName);
    if (existingWireName !== undefined) {
      throw new TelegramSerializationError(
        `${path} has a wire-name collision for ${JSON.stringify(field.wireName)} (${JSON.stringify(existingWireName.name)} and ${JSON.stringify(field.name)}).`,
      );
    }
    byName.set(field.name, field);
    byWireName.set(field.wireName, field);
  }
  return { byName, byWireName };
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new TelegramSerializationError(`${path} must be an object.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function defineValue(
  output: Record<string, unknown>,
  name: string,
  value: unknown,
  path: string,
): void {
  if (Object.hasOwn(output, name)) {
    throw new TelegramSerializationError(
      `${path} has a name collision for ${JSON.stringify(name)}.`,
    );
  }
  Object.defineProperty(output, name, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

interface FieldTable {
  readonly byName: ReadonlyMap<string, TelegramApiRuntimeField>;
  readonly byWireName: ReadonlyMap<string, TelegramApiRuntimeField>;
}
