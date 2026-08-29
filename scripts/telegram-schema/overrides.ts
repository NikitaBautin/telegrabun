import { parseTelegramSchemaIr, type TelegramSchemaIr } from './ir.ts';

/** The version of the checked-in manual override document format. */
export const TELEGRAM_SCHEMA_OVERRIDES_FORMAT_VERSION = 1 as const;

type JsonRecord = Record<string, unknown>;

type OverridePath =
  | {
      readonly kind: 'object';
      readonly object: string;
    }
  | {
      readonly kind: 'field';
      readonly object: string;
      readonly field: string;
    }
  | {
      readonly kind: 'union';
      readonly union: string;
    }
  | {
      readonly kind: 'method';
      readonly method: string;
    };

export interface TelegramSchemaOverride {
  /**
   * A stable, name-based IR path. It identifies an existing object, field,
   * union, or method; array positions are deliberately not supported.
   */
  readonly path: string;
  /** Properties to replace on the node selected by `path`. */
  readonly patch: Readonly<Record<string, unknown>>;
}

export interface TelegramSchemaOverrides {
  readonly formatVersion: typeof TELEGRAM_SCHEMA_OVERRIDES_FORMAT_VERSION;
  readonly irFormatVersion: TelegramSchemaIr['formatVersion'];
  readonly apiVersion: string;
  readonly overrides: readonly TelegramSchemaOverride[];
}

export interface TelegramSchemaOverrideApplication {
  readonly index: number;
  readonly path: string;
  readonly properties: readonly string[];
}

export interface ApplyTelegramSchemaOverridesResult {
  readonly ir: TelegramSchemaIr;
  readonly applications: readonly TelegramSchemaOverrideApplication[];
}

export class TelegramSchemaOverridesValidationError extends Error {
  public constructor(message: string) {
    super(`Invalid Telegram schema overrides: ${message}`);
    this.name = 'TelegramSchemaOverridesValidationError';
  }
}

export class TelegramSchemaOverrideApplicationError extends Error {
  public constructor(message: string) {
    super(`Unable to apply Telegram schema override: ${message}`);
    this.name = 'TelegramSchemaOverrideApplicationError';
  }
}

/** Parses and validates the versioned, JSON-serializable override document. */
export function parseTelegramSchemaOverrides(value: unknown): TelegramSchemaOverrides {
  const root = asRecord(value, 'root');
  const formatVersion = requiredInteger(root, 'formatVersion', 'root');
  if (formatVersion !== TELEGRAM_SCHEMA_OVERRIDES_FORMAT_VERSION) {
    throw invalid(
      `root.formatVersion must be ${TELEGRAM_SCHEMA_OVERRIDES_FORMAT_VERSION}, got ${formatVersion}`,
    );
  }

  const irFormatVersion = requiredInteger(root, 'irFormatVersion', 'root');
  if (irFormatVersion !== 1) {
    throw invalid(`root.irFormatVersion must be 1, got ${irFormatVersion}`);
  }

  return {
    formatVersion: TELEGRAM_SCHEMA_OVERRIDES_FORMAT_VERSION,
    irFormatVersion: 1,
    apiVersion: requiredString(root, 'apiVersion', 'root'),
    overrides: requiredArray(root, 'overrides', 'root').map((override, index) =>
      parseOverride(override, `overrides[${index}]`),
    ),
  };
}

/** Reads a local JSON override document without accessing the network. */
export async function loadTelegramSchemaOverrides(path: string): Promise<TelegramSchemaOverrides> {
  let value: unknown;
  try {
    value = await Bun.file(path).json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TelegramSchemaOverridesValidationError(`could not read ${path}: ${message}`);
  }
  return parseTelegramSchemaOverrides(value);
}

/**
 * Applies replacements to a validated IR and validates the completed result.
 * An override can only select a node that exists in the parser output, which
 * prevents a typo from silently inventing schema data.
 */
export function applyTelegramSchemaOverrides(
  ir: TelegramSchemaIr,
  overrides: TelegramSchemaOverrides,
): ApplyTelegramSchemaOverridesResult {
  const validatedIr = parseTelegramSchemaIr(ir);
  const validatedOverrides = parseTelegramSchemaOverrides(overrides);

  if (validatedOverrides.irFormatVersion !== validatedIr.formatVersion) {
    throw new TelegramSchemaOverrideApplicationError(
      `override IR format ${validatedOverrides.irFormatVersion} does not match IR format ${validatedIr.formatVersion}`,
    );
  }
  if (validatedOverrides.apiVersion !== validatedIr.apiVersion) {
    throw new TelegramSchemaOverrideApplicationError(
      `override API version ${validatedOverrides.apiVersion} does not match IR API version ${validatedIr.apiVersion}`,
    );
  }

  const patched = structuredClone(validatedIr) as MutableTelegramSchemaIr;
  const applications: TelegramSchemaOverrideApplication[] = [];

  for (const [index, override] of validatedOverrides.overrides.entries()) {
    const target = resolveTarget(patched, parsePath(override.path));
    const properties = Object.keys(override.patch);
    validatePatch(properties, target.kind, override.path);

    for (const property of properties) {
      target.node[property] = structuredClone(override.patch[property]);
    }
    applications.push({ index, path: override.path, properties });
  }

  try {
    return { ir: parseTelegramSchemaIr(patched), applications };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TelegramSchemaOverrideApplicationError(
      `the resulting IR is invalid after applying overrides: ${message}`,
    );
  }
}

type MutableTelegramSchemaIr = {
  -readonly [Property in keyof TelegramSchemaIr]: TelegramSchemaIr[Property];
};

function parseOverride(value: unknown, path: string): TelegramSchemaOverride {
  const override = asRecord(value, path);
  ensureExactKeys(override, ['path', 'patch'], path);
  const overridePath = requiredString(override, 'path', path);
  parsePath(overridePath);
  const patch = asRecord(override['patch'], `${path}.patch`);
  if (Object.keys(patch).length === 0) {
    throw invalid(`${path}.patch must replace at least one property`);
  }

  return { path: overridePath, patch: structuredClone(patch) };
}

function parsePath(path: string): OverridePath {
  const segments = path.split('/');
  if (segments[0] !== '' || segments.slice(1).some((segment) => segment.length === 0)) {
    throw invalid(`path must start with / and contain no empty segments: ${JSON.stringify(path)}`);
  }

  switch (segments[1]) {
    case 'objects':
      if (segments.length === 3 && isPascalCase(segments[2])) {
        return { kind: 'object', object: segments[2] };
      }
      if (
        segments.length === 5 &&
        isPascalCase(segments[2]) &&
        segments[3] === 'fields' &&
        isSnakeCase(segments[4])
      ) {
        return { kind: 'field', object: segments[2], field: segments[4] };
      }
      break;
    case 'unions':
      if (segments.length === 3 && isPascalCase(segments[2])) {
        return { kind: 'union', union: segments[2] };
      }
      break;
    case 'methods':
      if (segments.length === 3 && isCamelCase(segments[2])) {
        return { kind: 'method', method: segments[2] };
      }
      break;
  }

  throw invalid(
    `path ${JSON.stringify(path)} must identify /objects/<Object>, /objects/<Object>/fields/<field>, /unions/<Union>, or /methods/<method>`,
  );
}

function resolveTarget(
  ir: MutableTelegramSchemaIr,
  path: OverridePath,
): { readonly kind: OverridePath['kind']; readonly node: JsonRecord } {
  switch (path.kind) {
    case 'object': {
      const object = ir.objects.find(({ name }) => name === path.object);
      if (object === undefined) throw missingPath(path.object, 'object');
      return { kind: path.kind, node: object as unknown as JsonRecord };
    }
    case 'field': {
      const object = ir.objects.find(({ name }) => name === path.object);
      if (object === undefined) throw missingPath(path.object, 'object');
      const field = object.fields.find(({ name }) => name === path.field);
      if (field === undefined) throw missingPath(`${path.object}.fields.${path.field}`, 'field');
      return { kind: path.kind, node: field as unknown as JsonRecord };
    }
    case 'union': {
      const union = ir.unions.find(({ name }) => name === path.union);
      if (union === undefined) throw missingPath(path.union, 'union');
      return { kind: path.kind, node: union as unknown as JsonRecord };
    }
    case 'method': {
      const method = ir.methods.find(({ name }) => name === path.method);
      if (method === undefined) throw missingPath(path.method, 'method');
      return { kind: path.kind, node: method as unknown as JsonRecord };
    }
  }
}

function validatePatch(
  properties: readonly string[],
  targetKind: OverridePath['kind'],
  path: string,
): void {
  const allowed = {
    object: new Set(['description']),
    field: new Set(['description', 'required', 'type']),
    union: new Set(['description', 'members', 'discriminator']),
    method: new Set(['description', 'parameters', 'result']),
  }[targetKind];

  for (const property of properties) {
    if (!allowed.has(property)) {
      throw invalid(
        `path ${JSON.stringify(path)} cannot replace property ${JSON.stringify(property)}`,
      );
    }
  }
}

function missingPath(name: string, kind: string): TelegramSchemaOverrideApplicationError {
  return new TelegramSchemaOverrideApplicationError(
    `path selects a ${kind} that does not exist in the IR: ${name}`,
  );
}

function ensureExactKeys(record: JsonRecord, expected: readonly string[], path: string): void {
  for (const key of Object.keys(record)) {
    if (!expected.includes(key)) {
      throw invalid(`${path} has unsupported property ${JSON.stringify(key)}`);
    }
  }
  for (const key of expected) {
    if (!(key in record)) {
      throw invalid(`${path}.${key} is required`);
    }
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

function requiredInteger(record: JsonRecord, property: string, path: string): number {
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

function isPascalCase(value: string | undefined): value is string {
  return value !== undefined && /^[A-Z][A-Za-z0-9]*$/.test(value);
}

function isSnakeCase(value: string | undefined): value is string {
  return value !== undefined && /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(value);
}

function isCamelCase(value: string | undefined): value is string {
  return value !== undefined && /^[a-z][A-Za-z0-9]*$/.test(value);
}

function invalid(message: string): TelegramSchemaOverridesValidationError {
  return new TelegramSchemaOverridesValidationError(message);
}
