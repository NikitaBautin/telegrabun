# Telegram Bot API schema snapshot

The checked-in HTML file is the authoritative, network-free source for the schema generator.
The currently selected Telegram Bot API version is **10.3**, announced on 2026-08-24.

`snapshot-metadata.json` records the official source URL, the UTC retrieval date, file size,
and SHA-256 checksum. Verify a checkout before parsing or generating code:

```sh
bun run verify:telegram-schema
```

The command deliberately does not fetch the network. To reproduce this exact input, check out
the commit containing the snapshot and run the verification command. A future explicit schema
update may download `https://core.telegram.org/bots/api`, replace the HTML snapshot, and update
all corresponding metadata in the same commit.
