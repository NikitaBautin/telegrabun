import { join } from 'node:path';

import {
  parseTelegramSchemaIr,
  TELEGRAM_SCHEMA_IR_FORMAT_VERSION,
  type TelegramSchemaField,
  type TelegramSchemaIr,
  type TelegramSchemaObject,
  type TelegramSchemaType,
  type TelegramSchemaUnion,
} from './ir.ts';
import { verifyTelegramSchemaSnapshot } from './verify-snapshot.ts';

interface HtmlSection {
  readonly name: string;
  readonly body: string;
}

export interface ParseTelegramSchemaHtmlOptions {
  readonly apiVersion: string;
}

export class TelegramSchemaParseError extends Error {
  public constructor(message: string) {
    super(`Unable to parse Telegram Bot API HTML: ${message}`);
    this.name = 'TelegramSchemaParseError';
  }
}

/**
 * Converts a saved Telegram Bot API documentation page into the stable IR v1.
 * It intentionally accepts HTML text rather than a URL, so normal generation
 * never needs network access.
 */
export function parseTelegramSchemaHtml(
  html: string,
  options: ParseTelegramSchemaHtmlOptions,
): TelegramSchemaIr {
  const sections = readSections(html);
  const objects: TelegramSchemaObject[] = [];
  const unions: TelegramSchemaUnion[] = [];
  const methods: TelegramSchemaIr['methods'][number][] = [];

  for (const section of sections) {
    const table = readTable(section.body);

    if (table?.headers[0] === 'Field' && isPascalCase(section.name)) {
      if (section.name === 'InputFile') {
        continue;
      }

      objects.push({
        name: section.name,
        description: requiredDescription(section.name, section.body),
        fields: readFields(table, 'Field'),
      });
      continue;
    }

    if (isUnionSection(section.body) && isPascalCase(section.name)) {
      const members = readUnionMembers(section.body);
      if (members.length >= 2) {
        unions.push({
          name: section.name,
          description: requiredDescription(section.name, section.body),
          members,
        });
      }
      continue;
    }

    if (isPascalCase(section.name) && section.name !== 'InputFile') {
      objects.push({
        name: section.name,
        description: requiredDescription(section.name, section.body),
        fields: [],
      });
      continue;
    }

    const description = findFirstParagraph(section.body);
    if (isCamelCase(section.name) && description?.toLowerCase().includes('return')) {
      methods.push({
        name: section.name,
        description,
        parameters: table?.headers[0] === 'Parameter' ? readFields(table, 'Parameter') : [],
        result: readMethodResult(section.name, section.body),
      });
    }
  }

  const objectsByName = new Map(objects.map((object) => [object.name, object]));
  const unionsWithDiscriminators = unions.map((union) => ({
    ...union,
    ...inferDiscriminator(union, objectsByName),
  }));

  try {
    return parseTelegramSchemaIr({
      formatVersion: TELEGRAM_SCHEMA_IR_FORMAT_VERSION,
      apiVersion: options.apiVersion,
      objects,
      unions: unionsWithDiscriminators,
      methods,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TelegramSchemaParseError(message);
  }
}

/** Parses the checked-in snapshot after its checksum has been verified. */
export async function parseCheckedInTelegramSchemaSnapshot(): Promise<TelegramSchemaIr> {
  const metadata = await verifyTelegramSchemaSnapshot();
  const path = join(import.meta.dir, metadata.snapshot.path);
  return parseTelegramSchemaHtml(await Bun.file(path).text(), { apiVersion: metadata.api.version });
}

function readSections(html: string): readonly HtmlSection[] {
  const heading = /<h4\b[^>]*>[\s\S]*?<\/h4>/gi;
  const matches = [...html.matchAll(heading)];
  return matches.map((match, index) => {
    const headingHtml = match[0];
    const start = (match.index ?? 0) + headingHtml.length;
    const end =
      index + 1 < matches.length ? (matches[index + 1]?.index ?? html.length) : html.length;
    return { name: textContent(headingHtml), body: html.slice(start, end) };
  });
}

interface HtmlTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

function readTable(html: string): HtmlTable | undefined {
  const table = html.match(/<table\b[^>]*>[\s\S]*?<\/table>/i)?.[0];
  if (table === undefined) {
    return undefined;
  }

  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) => {
    const rowHtml = row[1] ?? '';
    return [...rowHtml.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(
      (cell) => cell[1] ?? '',
    );
  });
  const [header, ...body] = rows;
  if (header === undefined || header.length === 0) {
    throw new TelegramSchemaParseError('a table is missing its header row');
  }

  return { headers: header.map(textContent), rows: body };
}

function readFields(
  table: HtmlTable,
  expectedFirstHeader: 'Field' | 'Parameter',
): readonly TelegramSchemaField[] {
  if (table.headers[0] !== expectedFirstHeader || table.headers[1] !== 'Type') {
    throw new TelegramSchemaParseError(
      `unexpected ${expectedFirstHeader.toLowerCase()} table headers`,
    );
  }

  return table.rows.map((row, index) => {
    const requiredCell = expectedFirstHeader === 'Field' ? undefined : row[2];
    const descriptionCell = expectedFirstHeader === 'Field' ? row[2] : row[3];
    if (row[0] === undefined || row[1] === undefined || descriptionCell === undefined) {
      throw new TelegramSchemaParseError(
        `${expectedFirstHeader.toLowerCase()} table row ${index + 1} is incomplete`,
      );
    }

    return {
      name: textContent(row[0]),
      description: textContent(descriptionCell),
      required:
        expectedFirstHeader === 'Field'
          ? !/^Optional(?:\.|$)/.test(textContent(descriptionCell))
          : textContent(requiredCell ?? '') === 'Yes',
      type: readFieldType(
        row[1],
        textContent(descriptionCell),
        `${expectedFirstHeader.toLowerCase()} ${textContent(row[0])}`,
      ),
    };
  });
}

function isUnionSection(html: string): boolean {
  const description = findFirstParagraph(html)?.toLowerCase();
  if (description === undefined) {
    return false;
  }
  return (
    /\b(one of|following \d+ types|following types)\b/.test(description) && /<ul\b/i.test(html)
  );
}

function readUnionMembers(html: string): readonly TelegramSchemaType[] {
  const list = html.match(/<ul\b[^>]*>([\s\S]*?)<\/ul>/i)?.[1];
  if (list === undefined) {
    return [];
  }
  return [...list.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)].map((item) =>
    readType(item[1] ?? '', 'union member'),
  );
}

function inferDiscriminator(
  union: TelegramSchemaUnion,
  objectsByName: ReadonlyMap<string, TelegramSchemaObject>,
): Partial<Pick<TelegramSchemaUnion, 'discriminator'>> {
  const members = union.members.flatMap((member) =>
    member.kind === 'reference' ? [objectsByName.get(member.name)] : [],
  );
  if (members.length !== union.members.length) {
    return {};
  }

  const first = members[0];
  if (first === undefined) {
    return {};
  }
  for (const field of first.fields) {
    if (
      field.type.kind === 'literal' &&
      members.every((member) =>
        member?.fields.some(
          (candidate) => candidate.name === field.name && candidate.type.kind === 'literal',
        ),
      )
    ) {
      return { discriminator: { field: field.name } };
    }
  }
  return {};
}

function readMethodResult(name: string, html: string): TelegramSchemaType {
  const paragraph = firstParagraphHtml(html);
  const results = [
    ...paragraph.matchAll(
      /(?:on success,? )?(?:the method )?returns?\s+(.+?)(?:\.|;|<br\s*\/?>)/gi,
    ),
    ...paragraph.matchAll(/(?:on success,? )?(.+?)\s+is returned(?:\.|;|<br\s*\/?>)/gi),
  ].flatMap((match) => (match[1] === undefined ? [] : [match[1]]));
  const result = results.find((candidate) =>
    /<a\b[^>]*href="#|<em>(?:True|Boolean|Float|Integer|String)<\/em>|\bArray of\b/i.test(
      candidate,
    ),
  );
  if (result === undefined) {
    throw new TelegramSchemaParseError(`method ${name} does not declare a result`);
  }
  return readResultType(result, name);
}

function readResultType(html: string, method: string): TelegramSchemaType {
  const text = textContent(html).replace(/\s+on success$/i, '');
  const references = [...html.matchAll(/<a\b[^>]*href="#([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map((match) => textContent(match[2] ?? ''))
    .filter(isPascalCase);
  const reference = references.at(-1);
  const primitives: TelegramSchemaType[] = [];
  if (/\bTrue\b/.test(text)) primitives.push({ kind: 'primitive', name: 'true' });
  if (/\bBoolean\b/.test(text)) primitives.push({ kind: 'primitive', name: 'boolean' });
  if (/\bFloat\b/.test(text)) primitives.push({ kind: 'primitive', name: 'float' });
  if (/\bInteger\b/.test(text)) primitives.push({ kind: 'primitive', name: 'integer' });
  if (/\bString\b/.test(text)) primitives.push({ kind: 'primitive', name: 'string' });

  if (/\bArray of\b/i.test(text)) {
    if (reference !== undefined)
      return { kind: 'array', element: { kind: 'reference', name: reference } };
    const primitive = primitives.at(-1);
    if (primitive !== undefined) return { kind: 'array', element: primitive };
  }
  if (reference !== undefined && primitives.length > 0 && /\botherwise\b/i.test(text)) {
    return { kind: 'union', members: [{ kind: 'reference', name: reference }, ...primitives] };
  }
  if (reference !== undefined) return { kind: 'reference', name: reference };
  const primitive = primitives.at(-1);
  if (primitive !== undefined) return primitive;

  return readType(text.replace(/^(?:an?|the)\s+/i, ''), `result of ${method}`);
}

function readFieldType(html: string, description: string, path: string): TelegramSchemaType {
  const type = readType(html, path);
  if (type.kind !== 'primitive' || type.name !== 'string') {
    return type;
  }

  const literal = description.match(
    /\b(?:always|must be)\s+(?:[“"]([^”"]+)[”"]|([a-z][a-z0-9_]*)(?=[.,]|$))/i,
  );
  const value = literal?.[1] ?? literal?.[2];
  return value === undefined ? type : { kind: 'literal', value };
}

function readType(html: string, path: string): TelegramSchemaType {
  const value = textContent(html)
    .replace(/^(?:an?|the)\s+/i, '')
    .replace(/\s+(?:object|objects)$/i, '')
    .trim();
  const array = value.match(/^Array of (.+)$/i);
  if (array?.[1] !== undefined) {
    return { kind: 'array', element: readType(array[1], path) };
  }

  const alternatives = value.split(/(?:,\s*|\s+(?:and|or)\s+)/i);
  if (alternatives.length > 1) {
    return {
      kind: 'union',
      members: alternatives.map((alternative) => readType(alternative, path)),
    };
  }

  switch (value) {
    case 'Boolean':
      return { kind: 'primitive', name: 'boolean' };
    case 'Float':
      return { kind: 'primitive', name: 'float' };
    case 'Integer':
      return { kind: 'primitive', name: 'integer' };
    case 'String':
      return { kind: 'primitive', name: 'string' };
    case 'True':
      return { kind: 'primitive', name: 'true' };
    case 'InputFile':
      return { kind: 'input-file' };
    default:
      if (isPascalCase(value)) {
        return { kind: 'reference', name: value };
      }
      throw new TelegramSchemaParseError(`${path} has unsupported type ${JSON.stringify(value)}`);
  }
}

function requiredDescription(name: string, html: string): string {
  const paragraph = findFirstParagraph(html);
  return paragraph ?? `Telegram does not provide a prose description for ${name}.`;
}

function firstParagraphHtml(html: string): string {
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  if (paragraph === undefined)
    throw new TelegramSchemaParseError('a schema section is missing its description paragraph');
  return paragraph;
}

function findFirstParagraph(html: string): string | undefined {
  const paragraph = html.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
  return paragraph === undefined ? undefined : textContent(paragraph);
}

function textContent(html: string): string {
  return decodeHtml(
    html
      .replace(/<img\b[^>]*\balt=(['"])(.*?)\1[^>]*>/gi, '$2')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function decodeHtml(value: string): string {
  return value.replace(
    /&(?:#(\d+)|#x([\da-f]+)|quot|amp|lt|gt|nbsp|#39);/gi,
    (entity, decimal, hex) => {
      if (decimal !== undefined) return String.fromCodePoint(Number(decimal));
      if (hex !== undefined) return String.fromCodePoint(Number.parseInt(hex, 16));
      return (
        { '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" }[
          entity.toLowerCase()
        ] ?? entity
      );
    },
  );
}

function isPascalCase(value: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(value);
}

function isCamelCase(value: string): boolean {
  return /^[a-z][A-Za-z0-9]*$/.test(value);
}
