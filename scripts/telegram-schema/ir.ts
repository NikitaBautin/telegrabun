/**
 * Versioned intermediate representation (IR) for the Telegram Bot API schema.
 *
 * It deliberately keeps Telegram's wire names. Code generators decide how and
 * where to expose camelCase public names; the parser must not make that choice.
 */
export const TELEGRAM_SCHEMA_IR_FORMAT_VERSION = 1 as const;

export type TelegramSchemaPrimitive = 'boolean' | 'float' | 'integer' | 'string' | 'true';

export interface PrimitiveType {
  readonly kind: 'primitive';
  readonly name: TelegramSchemaPrimitive;
}

export interface LiteralType {
  readonly kind: 'literal';
  readonly value: boolean | number | string;
}

export interface ReferenceType {
  readonly kind: 'reference';
  readonly name: string;
}

export interface InputFileType {
  readonly kind: 'input-file';
}

export interface ArrayType {
  readonly kind: 'array';
  readonly element: TelegramSchemaType;
}

export interface UnionType {
  readonly kind: 'union';
  readonly members: readonly TelegramSchemaType[];
}

export type TelegramSchemaType =
  | ArrayType
  | InputFileType
  | LiteralType
  | PrimitiveType
  | ReferenceType
  | UnionType;

export interface TelegramSchemaField {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
  readonly type: TelegramSchemaType;
}

export interface TelegramSchemaObject {
  readonly name: string;
  readonly description: string;
  readonly fields: readonly TelegramSchemaField[];
}

export interface TelegramSchemaUnion {
  readonly name: string;
  readonly description: string;
  readonly members: readonly TelegramSchemaType[];
  readonly discriminator?: {
    readonly field: string;
  };
}

export interface TelegramSchemaMethod {
  readonly name: string;
  readonly description: string;
  readonly parameters: readonly TelegramSchemaField[];
  readonly result: TelegramSchemaType;
}

export interface TelegramSchemaIr {
  readonly formatVersion: typeof TELEGRAM_SCHEMA_IR_FORMAT_VERSION;
  readonly apiVersion: string;
  readonly objects: readonly TelegramSchemaObject[];
  readonly unions: readonly TelegramSchemaUnion[];
  readonly methods: readonly TelegramSchemaMethod[];
}

const primitiveNames = new Set<TelegramSchemaPrimitive>([
  'boolean',
  'float',
  'integer',
  'string',
  'true',
]);
const pascalCaseName = /^[A-Z][A-Za-z0-9]*$/;
const snakeCaseName = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const camelCaseName = /^[a-z][A-Za-z0-9]*$/;

type JsonRecord = Record<string, unknown>;

export class TelegramSchemaIrValidationError extends Error {
  public constructor(message: string) {
    super(`Invalid Telegram schema IR: ${message}`);
    this.name = 'TelegramSchemaIrValidationError';
  }
}

/**
 * Validates parsed JSON before it reaches an override or code-generation step.
 * This keeps malformed snapshots from producing partial generated output.
 */
export function parseTelegramSchemaIr(value: unknown): TelegramSchemaIr {
  const root = asRecord(value, 'root');
  const formatVersion = requiredNumber(root, 'formatVersion', 'root');

  if (formatVersion !== TELEGRAM_SCHEMA_IR_FORMAT_VERSION) {
    throw invalid(
      `root.formatVersion must be ${TELEGRAM_SCHEMA_IR_FORMAT_VERSION}, got ${formatVersion}`,
    );
  }

  const objects = requiredArray(root, 'objects', 'root').map((item, index) =>
    parseObject(item, `objects[${index}]`),
  );
  const unions = requiredArray(root, 'unions', 'root').map((item, index) =>
    parseUnion(item, `unions[${index}]`),
  );
  const methods = requiredArray(root, 'methods', 'root').map((item, index) =>
    parseMethod(item, `methods[${index}]`),
  );

  ensureUniqueNames(objects, 'object');
  ensureUniqueNames(unions, 'union');
  ensureDisjointNames(objects, unions);
  ensureUniqueNames(methods, 'method');

  const declaredTypes = new Set([...objects, ...unions].map(({ name }) => name));
  for (const object of objects) {
    validateFields(object.fields, `object ${object.name}`, declaredTypes);
  }
  for (const union of unions) {
    validateTypes(union.members, `union ${union.name}.members`, declaredTypes);
  }
  for (const method of methods) {
    validateFields(method.parameters, `method ${method.name}`, declaredTypes);
    validateType(method.result, `method ${method.name}.result`, declaredTypes);
  }

  return {
    formatVersion: TELEGRAM_SCHEMA_IR_FORMAT_VERSION,
    apiVersion: requiredString(root, 'apiVersion', 'root'),
    objects,
    unions,
    methods,
  };
}

function parseObject(value: unknown, path: string): TelegramSchemaObject {
  const object = asRecord(value, path);
  const name = requiredString(object, 'name', path);
  ensureName(name, pascalCaseName, `${path}.name`, 'PascalCase');

  return {
    name,
    description: requiredString(object, 'description', path),
    fields: requiredArray(object, 'fields', path).map((field, index) =>
      parseField(field, `${path}.fields[${index}]`),
    ),
  };
}

function parseUnion(value: unknown, path: string): TelegramSchemaUnion {
  const union = asRecord(value, path);
  const name = requiredString(union, 'name', path);
  ensureName(name, pascalCaseName, `${path}.name`, 'PascalCase');
  const members = requiredArray(union, 'members', path).map((member, index) =>
    parseType(member, `${path}.members[${index}]`),
  );

  if (members.length < 2) {
    throw invalid(`${path}.members must contain at least two members`);
  }

  const discriminatorValue = union['discriminator'];
  let discriminator: TelegramSchemaUnion['discriminator'];
  if (discriminatorValue !== undefined) {
    const discriminatorRecord = asRecord(discriminatorValue, `${path}.discriminator`);
    discriminator = {
      field: requiredString(discriminatorRecord, 'field', `${path}.discriminator`),
    };
    ensureName(discriminator.field, snakeCaseName, `${path}.discriminator.field`, 'snake_case');
  }

  return {
    name,
    description: requiredString(union, 'description', path),
    members,
    ...(discriminator === undefined ? {} : { discriminator }),
  };
}

function parseMethod(value: unknown, path: string): TelegramSchemaMethod {
  const method = asRecord(value, path);
  const name = requiredString(method, 'name', path);
  ensureName(name, camelCaseName, `${path}.name`, 'camelCase');

  return {
    name,
    description: requiredString(method, 'description', path),
    parameters: requiredArray(method, 'parameters', path).map((parameter, index) =>
      parseField(parameter, `${path}.parameters[${index}]`),
    ),
    result: parseType(method['result'], `${path}.result`),
  };
}

function parseField(value: unknown, path: string): TelegramSchemaField {
  const field = asRecord(value, path);
  const name = requiredString(field, 'name', path);
  ensureName(name, snakeCaseName, `${path}.name`, 'snake_case');

  return {
    name,
    description: requiredString(field, 'description', path),
    required: requiredBoolean(field, 'required', path),
    type: parseType(field['type'], `${path}.type`),
  };
}

function parseType(value: unknown, path: string): TelegramSchemaType {
  const type = asRecord(value, path);
  const kind = requiredString(type, 'kind', path);

  switch (kind) {
    case 'array':
      return { kind, element: parseType(type['element'], `${path}.element`) };
    case 'input-file':
      return { kind };
    case 'literal':
      return { kind, value: requiredLiteral(type, 'value', path) };
    case 'primitive': {
      const name = requiredString(type, 'name', path);
      if (!primitiveNames.has(name as TelegramSchemaPrimitive)) {
        throw invalid(`${path}.name must be a supported primitive, got ${name}`);
      }
      return { kind, name: name as TelegramSchemaPrimitive };
    }
    case 'reference': {
      const name = requiredString(type, 'name', path);
      ensureName(name, pascalCaseName, `${path}.name`, 'PascalCase');
      return { kind, name };
    }
    case 'union': {
      const members = requiredArray(type, 'members', path).map((member, index) =>
        parseType(member, `${path}.members[${index}]`),
      );
      if (members.length < 2) {
        throw invalid(`${path}.members must contain at least two members`);
      }
      return { kind, members };
    }
    default:
      throw invalid(`${path}.kind is unsupported: ${kind}`);
  }
}

function validateFields(
  fields: readonly TelegramSchemaField[],
  owner: string,
  declaredTypes: ReadonlySet<string>,
): void {
  ensureUniqueNames(fields, `${owner} field`);
  for (const field of fields) {
    validateType(field.type, `${owner}.${field.name}`, declaredTypes);
  }
}

function validateTypes(
  types: readonly TelegramSchemaType[],
  path: string,
  declaredTypes: ReadonlySet<string>,
): void {
  for (const [index, type] of types.entries()) {
    validateType(type, `${path}[${index}]`, declaredTypes);
  }
}

function validateType(
  type: TelegramSchemaType,
  path: string,
  declaredTypes: ReadonlySet<string>,
): void {
  switch (type.kind) {
    case 'array':
      validateType(type.element, `${path}.element`, declaredTypes);
      return;
    case 'reference':
      if (!declaredTypes.has(type.name)) {
        throw invalid(`${path} references unknown type ${type.name}`);
      }
      return;
    case 'union':
      validateTypes(type.members, `${path}.members`, declaredTypes);
      return;
    case 'input-file':
    case 'literal':
    case 'primitive':
      return;
  }
}

function ensureUniqueNames(
  entries: readonly { readonly name: string }[],
  entryDescription: string,
): void {
  const names = new Set<string>();
  for (const { name } of entries) {
    if (names.has(name)) {
      throw invalid(`duplicate ${entryDescription} name: ${name}`);
    }
    names.add(name);
  }
}

function ensureDisjointNames(
  objects: readonly TelegramSchemaObject[],
  unions: readonly TelegramSchemaUnion[],
): void {
  const objectNames = new Set(objects.map(({ name }) => name));
  for (const { name } of unions) {
    if (objectNames.has(name)) {
      throw invalid(`object and union share the name ${name}`);
    }
  }
}

function ensureName(name: string, pattern: RegExp, path: string, convention: string): void {
  if (!pattern.test(name)) {
    throw invalid(`${path} must be ${convention}, got ${name}`);
  }
}

function asRecord(value: unknown, path: string): JsonRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalid(`${path} must be an object`);
  }
  return value as JsonRecord;
}

function requiredArray(record: JsonRecord, property: string, path: string): readonly unknown[] {
  const value = record[property];
  if (!Array.isArray(value)) {
    throw invalid(`${path}.${property} must be an array`);
  }
  return value;
}

function requiredBoolean(record: JsonRecord, property: string, path: string): boolean {
  const value = record[property];
  if (typeof value !== 'boolean') {
    throw invalid(`${path}.${property} must be a boolean`);
  }
  return value;
}

function requiredLiteral(
  record: JsonRecord,
  property: string,
  path: string,
): boolean | number | string {
  const value = record[property];
  if (typeof value !== 'boolean' && typeof value !== 'number' && typeof value !== 'string') {
    throw invalid(`${path}.${property} must be a boolean, number, or string literal`);
  }
  return value;
}

function requiredNumber(record: JsonRecord, property: string, path: string): number {
  const value = record[property];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw invalid(`${path}.${property} must be an integer`);
  }
  return value;
}

function requiredString(record: JsonRecord, property: string, path: string): string {
  const value = record[property];
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(`${path}.${property} must be a non-empty string`);
  }
  return value;
}

function invalid(message: string): TelegramSchemaIrValidationError {
  return new TelegramSchemaIrValidationError(message);
}
