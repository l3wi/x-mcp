# Changelog

## 0.2.0

- Hid write tools and mutating local auth/config tools from MCP when they are not safe to expose.
- Required write OAuth scopes before enabling read-write mode or accepting read-write runtime auth.
- Prevented failed read-write authorization attempts from overwriting existing tokens.
- Fixed logout revocation reporting when X rejects token revocation.
- Hardened X API error messages, username validation, poll validation, and public metrics requests.
- Scoped auth export bootstrap handling so unrelated commands cannot accidentally print auth bundles.
- Updated package metadata for the `l3wi/x-cli` repository.
- Made `x-cli` the canonical npm CLI and MCP server command.
- Moved package distribution toward Node.js 20+ with built `dist` output.
- Blocked auth bundle export while serving MCP.
- Made read-write mode persistence depend on successful OAuth write-scope grants.
- Made logout always clear local tokens even when remote revocation cannot run.
- Added npm package metadata, license, and npm-first documentation.
