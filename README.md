# telegrabun

A type-safe, Bun-first library for building Telegram bots with the Telegram Bot API.

> **Status:** `0.1.0` is the project scaffold. The generated, typed low-level `Api` façade
> and its transport contract are available; the public `Bot` API, polling, webhooks, and file
> uploads are still under active development.

The package exports `Api` at runtime, plus generated public types and the `TelegramTransport`
contract for composing a transport implementation. `version` remains available for build and
integration checks.

## Requirements

- [Bun](https://bun.sh) 1.4 or later
- A Telegram bot token from [@BotFather](https://t.me/BotFather) once the client API ships

## Installation

```sh
bun add telegrabun
```

## Planned API

The library is being designed around a small high-level bot interface and a complete,
typed low-level Bot API client:

```ts
import { Bot } from 'telegrabun';

const bot = new Bot(process.env.BOT_TOKEN!);

bot.command('start', (ctx) => ctx.reply('Hello!'));
bot.on('message:text', (ctx) => ctx.reply(ctx.message.text));

await bot.start();
```

The API shown above is a design target, not an API exported by `0.1.0`. See
[plans.md](./plans.md) for the implementation roadmap and scope.

## Development

```sh
bun install
bun run check
bun run pack:check
```

`check` formats-checks, lints, type-checks, tests, and builds the package. `pack:check`
creates a package tarball, verifies its contents, and smoke-tests JavaScript and TypeScript
imports from a clean temporary Bun project.

The generated Telegram schema will be maintained through the reproducible generator:

```sh
bun run generate
bun run check:generated
```

## Releases

Releases use [Changesets](https://github.com/changesets/changesets) and follow SemVer.
Add a changeset for every user-visible change:

```sh
bun run changeset
```

The release workflow publishes through npm trusted publishing (OIDC), not a
long-lived npm token. Maintainers should follow the [release security
runbook](./docs/release-security.md) before the first publish and whenever
release access changes.

## License

[MIT](./LICENSE) © 2026 Nikita Bautin
