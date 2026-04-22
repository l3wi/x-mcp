# Changelog

## 0.2.3

- Added `x-cli auth login --manual` for remote OAuth login by pasting the full callback URL.

## 0.2.2

- Hardened OAuth refresh parsing, token normalization, and re-login guidance for invalid refresh tokens.

## 0.2.1

- Hid write tools and mutating local auth/config tools from MCP when they are not safe to expose.
- Required write OAuth scopes before enabling read-write mode or accepting read-write runtime auth.
- Prevented failed read-write authorization attempts from overwriting existing tokens.
- Fixed logout revocation reporting when X rejects token revocation.
- Hardened X API error messages, username validation, poll validation, and public metrics requests.
- Scoped auth export bootstrap handling so unrelated commands cannot accidentally print auth bundles.
- Updated package metadata for the `l3wi/x-cli` repository.
- Added a skills.sh-compatible `x-cli` skill and documented `npx skills add`.
- Added `x-cli auth import` for restoring exported auth bundles into local config and tokens.
- Changed `x-cli auth export json` to emit compact single-line JSON for easier import.
- Made `x-cli` the canonical npm CLI and MCP server command.
- Moved package distribution toward Node.js 20+ with built `dist` output.
- Blocked auth bundle export while serving MCP.
- Made read-write mode persistence depend on successful OAuth write-scope grants.
- Made logout always clear local tokens even when remote revocation cannot run.
- Added npm package metadata, license, and npm-first documentation.
