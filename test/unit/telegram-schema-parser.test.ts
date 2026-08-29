import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  parseCheckedInTelegramSchemaSnapshot,
  parseTelegramSchemaHtml,
} from '../../scripts/telegram-schema/parser.ts';
import { updateTelegramSchemaSnapshot } from '../../scripts/telegram-schema/update-snapshot.ts';

test('the saved Telegram HTML snapshot deterministically produces valid IR', async () => {
  const ir = await parseCheckedInTelegramSchemaSnapshot();

  expect(ir.apiVersion).toBe('10.3');
  expect(ir.objects.length).toBeGreaterThan(300);
  expect(ir.unions.length).toBeGreaterThan(20);
  expect(ir.methods.length).toBeGreaterThan(150);
  expect(ir.objects.find(({ name }) => name === 'User')?.fields[0]).toMatchObject({
    name: 'id',
    required: true,
    type: { kind: 'primitive', name: 'integer' },
  });
  expect(ir.methods.find(({ name }) => name === 'getUpdates')?.result).toEqual({
    kind: 'array',
    element: { kind: 'reference', name: 'Update' },
  });
  expect(ir.unions.find(({ name }) => name === 'ChatMember')?.discriminator).toEqual({
    field: 'status',
  });
  expect(ir.unions.find(({ name }) => name === 'InputMedia')?.discriminator).toEqual({
    field: 'type',
  });
});

test('the HTML parser handles optional fields, unions, literals, InputFile, and method results', () => {
  const ir = parseTelegramSchemaHtml(
    `
    <h4>Thing</h4><p>A test object.</p><table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
    <tr><td>kind</td><td>String</td><td>Kind, always “thing”</td></tr>
    <tr><td>file</td><td>InputFile or String</td><td><em>Optional</em>. File.</td></tr></table>
    <h4>OtherThing</h4><p>Another test object.</p><table><tr><th>Field</th><th>Type</th><th>Description</th></tr>
    <tr><td>kind</td><td>String</td><td>Kind, always “other”</td></tr></table>
    <h4>Things</h4><p>These can be one of</p><ul><li>Thing</li><li>OtherThing</li></ul>
    <h4>getThings</h4><p>Returns an Array of Things on success.</p>
  `,
    { apiVersion: 'test' },
  );

  expect(ir.objects.find(({ name }) => name === 'Thing')?.fields).toEqual([
    {
      name: 'kind',
      description: 'Kind, always “thing”',
      required: true,
      type: { kind: 'literal', value: 'thing' },
    },
    {
      name: 'file',
      description: 'Optional. File.',
      required: false,
      type: {
        kind: 'union',
        members: [{ kind: 'input-file' }, { kind: 'primitive', name: 'string' }],
      },
    },
  ]);
  expect(ir.unions).toEqual([
    {
      name: 'Things',
      description: 'These can be one of',
      members: [
        { kind: 'reference', name: 'Thing' },
        { kind: 'reference', name: 'OtherThing' },
      ],
      discriminator: { field: 'kind' },
    },
  ]);
  expect(ir.methods[0]?.result).toEqual({
    kind: 'array',
    element: { kind: 'reference', name: 'Things' },
  });
});

test('the explicit snapshot updater saves versioned HTML and verified metadata', async () => {
  const schemaDirectory = await mkdtemp(join(tmpdir(), 'telegrabun-schema-'));
  const html = '<h4>August 24, 2026</h4><p><strong>Bot API 10.3</strong></p>';
  const metadata = await updateTelegramSchemaSnapshot({
    schemaDirectory,
    sourceUrl: 'https://example.test/bots/api',
    now: new Date('2026-08-29T12:00:00.000Z'),
    fetcher: async (url) => {
      expect(url).toBe('https://example.test/bots/api');
      return new Response(html, { status: 200 });
    },
  });

  expect(metadata).toMatchObject({
    api: { version: '10.3', announcedAt: '2026-08-24' },
    source: { url: 'https://example.test/bots/api', retrievedAt: '2026-08-29' },
    snapshot: { path: 'snapshots/telegram-bot-api-10.3.html', bytes: html.length },
  });
  expect(await Bun.file(join(schemaDirectory, metadata.snapshot.path)).text()).toBe(html);
  expect(await Bun.file(join(schemaDirectory, 'snapshot-metadata.json')).json()).toEqual(metadata);
});
