# Telegram schema IR v1

`TelegramSchemaIr` is the versioned, JSON-serializable boundary between the Telegram HTML parser,
manual overrides, and code generators. It represents the Telegram wire contract, so field and
parameter names stay in `snake_case`; conversion to public `camelCase` belongs downstream.

Every IR document has this shape:

```json
{
  "formatVersion": 1,
  "apiVersion": "10.3",
  "objects": [],
  "unions": [],
  "methods": []
}
```

Objects have named `fields`; methods have named `parameters` and one `result`. Each field records
its source description and an explicit `required` boolean, including fields that are conditionally
required in Telegram prose. That prose is retained in `description`; no unsupported conditional
constraint is silently invented by the parser.

Some API headings have no prose paragraph at all. For those objects the parser records the explicit
marker `Telegram does not provide a prose description for <Type>.` so the omission remains visible
without violating the non-empty IR contract.

Types are tagged JSON nodes. The supported nodes are `primitive` (`boolean`, `float`, `integer`,
`string`, or `true`), `literal`, `reference`, `input-file`, `array`, and `union`. Arrays and unions
nest recursively. Named unions may declare a `discriminator.field` when Telegram objects use a
shared wire field such as `status` to discriminate variants.

The checked-in fixture at `fixtures/bot-api-edge-cases.json` is intentionally small but covers the
parser and generator edge cases that have historically been ambiguous in Bot API documentation:
optional versus required fields, nested arrays/unions, `Integer or String`, `InputFile or String`,
empty method parameters, named discriminated unions, and primitive, object, array, union, and
`True` method results. It is validated by `test/unit/telegram-schema-ir.test.ts` and is not a
replacement for the full HTML snapshot.

The runtime representation and validation entry point live in `../ir.ts`. Producers must validate
their JSON with `parseTelegramSchemaIr` before applying overrides or writing generated files.
