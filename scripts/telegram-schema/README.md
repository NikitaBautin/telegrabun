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
[IR contract](./ir/README.md), without writing code yet. Its edge-case fixture is intentionally
independent of the full snapshot and is validated by the unit suite.
