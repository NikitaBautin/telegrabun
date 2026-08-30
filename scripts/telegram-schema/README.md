# Telegram Bot API schema snapshot

The checked-in HTML file is the authoritative, network-free source for the schema generator.
The currently selected Telegram Bot API version is **10.3**, announced on 2026-08-24.

`snapshot-metadata.json` records the official source URL, the UTC retrieval date, file size,
and SHA-256 checksum. Verify a checkout before parsing or generating code:

```sh
bun run verify:telegram-schema
```

The command deliberately does not fetch the network. To reproduce this exact input, check out
the commit containing the snapshot and run the verification command. To explicitly refresh the
official source, run:

```sh
bun run update:telegram-schema
```

This is the only schema command that uses the network. It saves a versioned HTML file and updates
the URL, retrieval date, announcement date, size, and checksum in the same change.

## Intermediate representation

`bun run generate` verifies and parses the snapshot into the versioned, JSON-serializable
[IR contract](./ir/README.md), applies the version-matched document in
[`overrides/`](./overrides/), then writes formatted wire-format types to `src/generated/wire.ts`,
public declarations to `src/generated/public.ts`, and serializer metadata to
`src/generated/metadata.ts`. Wire declarations preserve Telegram's `snake_case` field names;
public declarations use `camelCase` and include `ApiMethodMap` plus parameter/result helpers.
Runtime metadata records verified snapshot provenance, public/wire field names, complete type
trees, and potential `InputFile` attachments without performing work on import. Its edge-case
fixture is intentionally independent of the full snapshot and is validated by the unit suite.

## Manual overrides

Telegram documentation occasionally needs a correction that cannot be inferred safely from its
HTML. `overrides/telegram-bot-api-<version>.json` is the small, versioned place for that input:

```json
{
  "formatVersion": 1,
  "irFormatVersion": 1,
  "apiVersion": "10.3",
  "overrides": [
    {
      "path": "/objects/Example/fields/value",
      "patch": { "required": true }
    }
  ]
}
```

Paths are name-based and may select only an existing IR object (`/objects/<Object>`), its field
(`.../fields/<field>`), union (`/unions/<Union>`), or method (`/methods/<method>`). Patches can
replace only documented properties for that node. The full patched IR is validated again, and
generation reports every applied path. This makes a stale override fail loudly after a snapshot
update instead of silently adding schema data.
