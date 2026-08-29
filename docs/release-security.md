# Release security

`telegrabun` is published only by the `Release` GitHub Actions workflow in
`.github/workflows/release.yml`. The publish job runs in the `npm-publish`
GitHub environment and requests an OIDC token with `id-token: write`; it does
not use `NPM_TOKEN`.

## Required GitHub configuration

Create the active `Protect main` branch ruleset for `main` with no bypass list:

- require pull requests before merging;
- block force pushes and branch deletion;
- after the first CI run on `main`, require the `CI` workflow's verification
  check before merging.

Create the `npm-publish` environment and restrict deployments to the `main`
branch only. The repository owner, `NikitaBautin`, is the release owner until
additional maintainers are explicitly appointed. Do not add an Actions secret
named `NPM_TOKEN`.

## npm trusted publisher

npm can configure a trusted publisher only after the package already exists in
the registry. Immediately after the first successful `0.1.0` publication,
configure the package in npm's **Settings → Trusted publishing** with:

| Field                | Value          |
| -------------------- | -------------- |
| Provider             | GitHub Actions |
| Organization or user | `NikitaBautin` |
| Repository           | `telegrabun`   |
| Workflow filename    | `release.yml`  |
| Environment name     | `npm-publish`  |
| Allowed action       | `npm publish`  |

Then set **Publishing access** to **Require two-factor authentication and
disallow tokens**. This preserves OIDC publishing while preventing traditional
automation tokens from publishing the package.

The release workflow uses a GitHub-hosted runner, Node 24, and the public
repository. Those conditions, together with the OIDC publisher, make npm
generate provenance attestations automatically. `publishConfig.provenance` in
`package.json` remains an explicit declaration of that intent.

## Verification

After creating the npm trust relation, trigger the release workflow from
protected `main` and verify that its publish step succeeds without
`NPM_TOKEN`. Check the published package page for its provenance attestation.
