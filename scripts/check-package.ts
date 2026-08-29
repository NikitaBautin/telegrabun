import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const projectRoot = resolve(import.meta.dir, '..');
const requiredPackageFiles = [
  'CHANGELOG.md',
  'LICENSE',
  'README.md',
  'dist/index.d.ts',
  'dist/index.js',
  'package.json',
];
const forbiddenPackagePrefixes = ['.changeset/', 'examples/', 'scripts/', 'src/', 'test/'];

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
  const missingFiles = requiredPackageFiles.filter((file) => !files.includes(file));

  if (missingFiles.length > 0) {
    throw new Error(`Package tarball is missing: ${missingFiles.join(', ')}`);
  }

  const forbiddenFiles = files.filter((file) =>
    forbiddenPackagePrefixes.some((prefix) => file.startsWith(prefix)),
  );

  if (forbiddenFiles.length > 0) {
    throw new Error(`Package tarball contains development files: ${forbiddenFiles.join(', ')}`);
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
  await Bun.write(join(directory, 'smoke.js'), "import 'telegrabun';\n");
  await Bun.write(join(directory, 'smoke.ts'), "import 'telegrabun';\n");

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

  const smokeDirectory = join(temporaryDirectory, 'smoke');
  await mkdir(smokeDirectory);
  await smokeTest(archivePath, smokeDirectory);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
}
