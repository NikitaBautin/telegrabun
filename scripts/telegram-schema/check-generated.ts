import { join } from 'node:path';

import { generateTelegramSchema } from './generate.ts';

const repositoryDirectory = join(import.meta.dir, '../..');

await generateTelegramSchema();

const diff = Bun.spawn(['git', 'diff', '--exit-code', 'HEAD', '--', 'src/generated'], {
  cwd: repositoryDirectory,
  stderr: 'inherit',
  stdout: 'inherit',
});
if ((await diff.exited) !== 0) {
  throw new Error(
    'Generated Telegram schema artifacts are stale. Run "bun run generate" and commit src/generated/.',
  );
}
