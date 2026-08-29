import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dir, '..');
const outputDirectory = resolve(projectRoot, 'dist');

await rm(outputDirectory, { force: true, recursive: true });

const buildOutput = await Bun.build({
  entrypoints: [resolve(projectRoot, 'src/index.ts')],
  format: 'esm',
  outdir: outputDirectory,
  sourcemap: 'linked',
  target: 'bun',
});

if (!buildOutput.success) {
  console.error(buildOutput.logs);
  throw new Error('Bun failed to build the package.');
}

const declarationBuild = Bun.spawn({
  cmd: ['bun', 'x', 'tsc', '--project', 'tsconfig.build.json'],
  cwd: projectRoot,
  stderr: 'inherit',
  stdout: 'inherit',
});

const exitCode = await declarationBuild.exited;

if (exitCode !== 0) {
  throw new Error(`Type declaration build failed with exit code ${exitCode}.`);
}
