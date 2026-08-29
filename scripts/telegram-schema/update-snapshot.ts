import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';

const officialSourceUrl = 'https://core.telegram.org/bots/api';

interface SnapshotMetadata {
  readonly formatVersion: 1;
  readonly api: { readonly version: string; readonly announcedAt: string };
  readonly source: { readonly url: string; readonly retrievedAt: string };
  readonly snapshot: { readonly path: string; readonly sha256: string; readonly bytes: number };
}

export interface UpdateTelegramSchemaSnapshotOptions {
  readonly fetcher?: (input: Request | URL | string, init?: RequestInit) => Promise<Response>;
  readonly now?: Date;
  readonly schemaDirectory?: string;
  readonly sourceUrl?: string;
}

/** Downloads the official source once and updates its checked-in metadata. */
export async function updateTelegramSchemaSnapshot(
  options: UpdateTelegramSchemaSnapshotOptions = {},
): Promise<SnapshotMetadata> {
  const sourceUrl = options.sourceUrl ?? officialSourceUrl;
  const schemaDirectory = options.schemaDirectory ?? import.meta.dir;
  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(sourceUrl, { headers: { accept: 'text/html' } });
  if (!response.ok) {
    throw new Error(
      `Telegram Bot API snapshot download failed: ${response.status} ${response.statusText}`,
    );
  }

  const contents = await response.arrayBuffer();
  const html = new TextDecoder().decode(contents);
  const api = readApiVersion(html);
  const filename = `telegram-bot-api-${api.version}.html`;
  const snapshotPath = join(schemaDirectory, 'snapshots', filename);
  const metadata: SnapshotMetadata = {
    formatVersion: 1,
    api,
    source: { url: sourceUrl, retrievedAt: (options.now ?? new Date()).toISOString().slice(0, 10) },
    snapshot: {
      path: `snapshots/${filename}`,
      sha256: new Bun.CryptoHasher('sha256').update(contents).digest('hex'),
      bytes: contents.byteLength,
    },
  };

  await mkdir(join(schemaDirectory, 'snapshots'), { recursive: true });
  await Bun.write(snapshotPath, contents);
  await Bun.write(
    join(schemaDirectory, 'snapshot-metadata.json'),
    `${JSON.stringify(metadata, null, 2)}\n`,
  );
  return metadata;
}

function readApiVersion(html: string): SnapshotMetadata['api'] {
  const match = html.match(
    /<h4\b[^>]*>[\s\S]*?<\/h4>\s*<p>\s*<strong>Bot API ([\d.]+)<\/strong>\s*<\/p>/i,
  );
  if (match?.[1] === undefined) {
    throw new Error('Telegram Bot API snapshot does not contain a current API version');
  }
  const date = textContent(match[0].match(/<h4\b[^>]*>([\s\S]*?)<\/h4>/i)?.[1] ?? '');
  if (!/^\w+ \d{1,2}, \d{4}$/.test(date)) {
    throw new Error('Telegram Bot API snapshot does not contain an announcement date');
  }
  return { version: match[1], announcedAt: new Date(`${date} UTC`).toISOString().slice(0, 10) };
}

function textContent(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

if (import.meta.main) {
  const metadata = await updateTelegramSchemaSnapshot();
  console.info(`Saved Telegram Bot API ${metadata.api.version} snapshot.`);
}
