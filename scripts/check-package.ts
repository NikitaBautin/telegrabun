import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const projectRoot = resolve(import.meta.dir, '..');
const expectedPackageFiles = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/api/client-core.d.ts.map',
  'dist/api/client-core.d.ts',
  'dist/api/serializer.d.ts.map',
  'dist/api/serializer.d.ts',
  'dist/generated/client.d.ts.map',
  'dist/generated/client.d.ts',
  'dist/generated/metadata.d.ts.map',
  'dist/generated/metadata.d.ts',
  'dist/generated/public.d.ts.map',
  'dist/generated/public.d.ts',
  'dist/generated/wire.d.ts.map',
  'dist/generated/wire.d.ts',
  'dist/index.d.ts.map',
  'dist/index.d.ts',
  'dist/index.js',
  'dist/index.js.map',
  'dist/transport/telegram-transport.d.ts.map',
  'dist/transport/telegram-transport.d.ts',
  'package.json',
];
const expectedPackageMetadata = {
  author: 'Nikita Bautin',
  bugs: { url: 'https://github.com/NikitaBautin/telegrabun/issues' },
  description: 'A type-safe, Bun-first Telegram Bot API library',
  engines: { bun: '>=1.4.0' },
  files: ['dist', 'README.md', 'CHANGELOG.md', 'LICENSE'],
  homepage: 'https://github.com/NikitaBautin/telegrabun#readme',
  keywords: ['bot', 'bun', 'telegram', 'telegram-bot', 'telegram-bot-api', 'typescript'],
  name: 'telegrabun',
  repository: {
    type: 'git',
    url: 'git+https://github.com/NikitaBautin/telegrabun.git',
  },
} as const;

async function run(command: string[], cwd: string): Promise<void> {
  const child = Bun.spawn({ cmd: command, cwd, stderr: 'inherit', stdout: 'inherit' });
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error(`Command failed (${exitCode}): ${command.join(' ')}`);
  }
}

async function listArchiveFiles(archivePath: string): Promise<string[]> {
  const child = Bun.spawn({
    cmd: ['tar', '-tzf', archivePath],
    stderr: 'inherit',
    stdout: 'pipe',
  });
  const listing = await new Response(child.stdout).text();
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error('Unable to list the package tarball contents.');
  }

  return listing
    .split('\n')
    .filter(Boolean)
    .map((file) => file.replace(/^package\//, ''));
}

function assertPackageContents(files: string[]): void {
  const unexpectedFiles = files.filter((file) => !expectedPackageFiles.includes(file));
  const missingFiles = expectedPackageFiles.filter((file) => !files.includes(file));

  if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
    throw new Error(
      [
        'Package tarball must contain exactly the expected files.',
        missingFiles.length > 0 ? `Missing: ${missingFiles.join(', ')}.` : undefined,
        unexpectedFiles.length > 0 ? `Unexpected: ${unexpectedFiles.join(', ')}.` : undefined,
      ]
        .filter((message): message is string => message !== undefined)
        .join(' '),
    );
  }
}

async function readArchivePackageMetadata(archivePath: string): Promise<unknown> {
  const child = Bun.spawn({
    cmd: ['tar', '-xOzf', archivePath, 'package/package.json'],
    stderr: 'inherit',
    stdout: 'pipe',
  });
  const packageJson = await new Response(child.stdout).text();
  const exitCode = await child.exited;

  if (exitCode !== 0) {
    throw new Error('Unable to read package.json from the package tarball.');
  }

  return JSON.parse(packageJson) as unknown;
}

function assertPackageMetadata(metadata: unknown): void {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
    throw new Error('Package tarball package.json must be an object.');
  }

  const packageMetadata = metadata as Record<string, unknown>;
  const mismatches = Object.entries(expectedPackageMetadata).flatMap(([key, value]) =>
    JSON.stringify(packageMetadata[key]) === JSON.stringify(value) ? [] : [key],
  );

  if (mismatches.length > 0) {
    throw new Error(`Package tarball has invalid metadata: ${mismatches.join(', ')}.`);
  }
}

async function findArchive(directory: string): Promise<string> {
  const entries = await readdir(directory);
  const archive = entries.find((entry) => entry.endsWith('.tgz'));

  if (archive === undefined) {
    throw new Error('bun pm pack did not create a tarball.');
  }

  return join(directory, archive);
}

async function smokeTest(archivePath: string, directory: string): Promise<void> {
  await Bun.write(
    join(directory, 'package.json'),
    JSON.stringify(
      {
        dependencies: { telegrabun: `file:${archivePath}` },
        private: true,
        type: 'module',
      },
      undefined,
      2,
    ),
  );
  const smokeProgram = `
import { Api } from 'telegrabun';

const api = new Api({
  async call() {
    return { first_name: 'Ada', id: 42, is_bot: true };
  },
});
const user = await api.getMe();

if (user.firstName !== 'Ada') {
  throw new Error('Public Api smoke test returned an unexpected result.');
}
`;
  await Bun.write(join(directory, 'smoke.js'), smokeProgram);
  await Bun.write(
    join(directory, 'smoke.ts'),
    `
import { Api, type SendMessageParams, type TelegramTransport } from 'telegrabun';

const transport: TelegramTransport = {
  async call() {
    return { first_name: 'Ada', id: 42, is_bot: true };
  },
};
const api = new Api(transport);
const params: SendMessageParams = { chatId: 42, text: 'Hello' };
const user = await api.getMe();

void params;
if (user.firstName !== 'Ada') {
  throw new Error('Public Api smoke test returned an unexpected result.');
}
`,
  );

  await run(['bun', 'install', '--ignore-scripts'], directory);
  await run(['bun', 'run', 'smoke.js'], directory);
  await run(['bun', 'run', 'smoke.ts'], directory);
}

const temporaryDirectory = await mkdtemp(join(tmpdir(), 'telegrabun-pack-'));

try {
  await run(['bun', 'run', 'build'], projectRoot);
  await run(
    ['bun', 'pm', 'pack', '--destination', temporaryDirectory, '--ignore-scripts'],
    projectRoot,
  );

  const archivePath = await findArchive(temporaryDirectory);
  assertPackageContents(await listArchiveFiles(archivePath));
  assertPackageMetadata(await readArchivePackageMetadata(archivePath));

  const smokeDirectory = join(temporaryDirectory, 'smoke');
  await mkdir(smokeDirectory);
  await smokeTest(archivePath, smokeDirectory);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
