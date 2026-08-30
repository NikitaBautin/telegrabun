import { join } from 'node:path';

import {
  generateTelegramApiClient,
  generateTelegramPublicTypes,
  generateTelegramRuntimeMetadata,
  generateTelegramWireTypes,
} from './codegen.ts';
import { applyTelegramSchemaOverrides, loadTelegramSchemaOverrides } from './overrides.ts';
import { parseCheckedInTelegramSchemaSnapshot } from './parser.ts';
import { verifyTelegramSchemaSnapshot } from './verify-snapshot.ts';

const defaultOutputDirectory = join(import.meta.dir, '../../src/generated');
const formatterConfigurationPath = join(import.meta.dir, '../../.oxfmtrc.json');

export interface GenerateTelegramSchemaOptions {
  /** Directory that receives the generated TypeScript artifacts. */
  readonly outputDirectory?: string;
}

export interface GenerateTelegramSchemaResult {
  readonly apiVersion: string;
  readonly objectCount: number;
  readonly unionCount: number;
  readonly methodCount: number;
  readonly overrideApplications: readonly {
    readonly path: string;
    readonly properties: readonly string[];
  }[];
}

/**
 * Rebuilds the checked-in schema artifacts without accessing the network.
 *
 * The generator deliberately owns the complete parser → overrides → codegen →
 * format pipeline, so both local development and CI produce byte-identical
 * output from the checked-in snapshot.
 */
export async function generateTelegramSchema(
  options: GenerateTelegramSchemaOptions = {},
): Promise<GenerateTelegramSchemaResult> {
  const [ir, snapshotMetadata] = await Promise.all([
    parseCheckedInTelegramSchemaSnapshot(),
    verifyTelegramSchemaSnapshot(),
  ]);
  const overridesPath = join(
    import.meta.dir,
    'overrides',
    `telegram-bot-api-${ir.apiVersion}.json`,
  );
  const result = applyTelegramSchemaOverrides(ir, await loadTelegramSchemaOverrides(overridesPath));
  const outputDirectory = options.outputDirectory ?? defaultOutputDirectory;
  const generatedPaths = [
    join(outputDirectory, 'wire.ts'),
    join(outputDirectory, 'public.ts'),
    join(outputDirectory, 'metadata.ts'),
    join(outputDirectory, 'client.ts'),
  ] as const;

  await Promise.all([
    Bun.write(generatedPaths[0], generateTelegramWireTypes(result.ir)),
    Bun.write(generatedPaths[1], generateTelegramPublicTypes(result.ir)),
    Bun.write(generatedPaths[2], generateTelegramRuntimeMetadata(result.ir, snapshotMetadata)),
    Bun.write(generatedPaths[3], generateTelegramApiClient(result.ir)),
  ]);
  await formatGeneratedTelegramSchema(generatedPaths);

  return {
    apiVersion: result.ir.apiVersion,
    objectCount: result.ir.objects.length,
    unionCount: result.ir.unions.length,
    methodCount: result.ir.methods.length,
    overrideApplications: result.applications,
  };
}

async function formatGeneratedTelegramSchema(paths: readonly string[]): Promise<void> {
  const formatter = Bun.spawn(
    ['bunx', 'oxfmt', '--config', formatterConfigurationPath, '--write', ...paths],
    {
      stderr: 'inherit',
      stdout: 'inherit',
    },
  );
  if ((await formatter.exited) !== 0) {
    throw new Error('Could not format generated Telegram schema artifacts.');
  }
}

if (import.meta.main) {
  const result = await generateTelegramSchema();
  for (const application of result.overrideApplications) {
    console.info(`Applied override ${application.path}: ${application.properties.join(', ')}.`);
  }
  console.info(
    `Generated Telegram Bot API ${result.apiVersion}: ${result.objectCount} objects, ${result.unionCount} unions, ${result.methodCount} methods; ${result.overrideApplications.length} overrides applied.`,
  );
}
