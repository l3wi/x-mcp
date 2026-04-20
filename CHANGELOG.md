# Changelog

## 0.2.0

- Made `x-mcp` the canonical npm CLI and MCP server command.
- Moved package distribution toward Node.js 20+ with built `dist` output.
- Blocked auth bundle export while serving MCP.
- Made read-write mode persistence depend on successful OAuth write-scope grants.
- Made logout always clear local tokens even when remote revocation cannot run.
- Added npm package metadata, license, and npm-first documentation.
