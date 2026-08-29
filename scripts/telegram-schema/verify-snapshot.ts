import { join } from 'node:path';

interface SnapshotMetadata {
  readonly formatVersion: number;
  readonly api: {
    readonly version: string;
    readonly announcedAt: string;
  };
  readonly source: {
    readonly url: string;
    readonly retrievedAt: string;
  };
  readonly snapshot: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
}

const schemaDirectory = import.meta.dir;
const metadataPath = join(schemaDirectory, 'snapshot-metadata.json');

export async function verifyTelegramSchemaSnapshot(): Promise<SnapshotMetadata> {
  const metadata = (await Bun.file(metadataPath).json()) as SnapshotMetadata;
  const snapshotPath = join(schemaDirectory, metadata.snapshot.path);
  const snapshot = Bun.file(snapshotPath);

  if (!(await snapshot.exists())) {
    throw new Error(`Telegram Bot API snapshot is missing: ${metadata.snapshot.path}`);
  }

  const contents = await snapshot.arrayBuffer();
  const sha256 = new Bun.CryptoHasher('sha256').update(contents).digest('hex');

  if (contents.byteLength !== metadata.snapshot.bytes) {
    throw new Error(
      `Telegram Bot API snapshot size mismatch: expected ${metadata.snapshot.bytes}, got ${contents.byteLength}`,
    );
  }

  if (sha256 !== metadata.snapshot.sha256) {
    throw new Error(
      `Telegram Bot API snapshot checksum mismatch: expected ${metadata.snapshot.sha256}, got ${sha256}`,
    );
  }

  return metadata;
}

if (import.meta.main) {
  const metadata = await verifyTelegramSchemaSnapshot();
  console.info(`Verified Telegram Bot API ${metadata.api.version} snapshot.`);
}
