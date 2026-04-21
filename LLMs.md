# LLMs.md -- Guide for AI Agents

You are an AI agent working with the x-cli codebase. This file summarizes the project shape and the important safety constraints.

## What This Is

x-cli is a TypeScript CLI and MCP stdio server built with [incur](https://github.com/wevm/incur) for X/Twitter API v2. Runtime target is Node.js 20+. The single public bin is `x-cli`.

A bare `x-cli` invocation is treated as `x-cli --mcp`. Explicit arguments such as `x-cli --help` or `x-cli tweet search "AI"` run normal CLI commands.

## Project Structure

```text
src/
  index.ts              -- Root CLI assembly, MCP mode detection, help formatting
  commands/
    auth.ts             -- auth login|logout|status|export
    config.ts           -- config show|mode
    tweet.ts            -- tweet post|get|delete|reply|quote|search|metrics|thread|context
    user.ts             -- user get|timeline|followers|following
    me.ts               -- me mentions|bookmarks|bookmark|unbookmark
    like.ts             -- top-level like command
    retweet.ts          -- top-level retweet command
  lib/
    api.ts              -- XApiClient methods for X API v2 endpoints
    argv.ts             -- Bootstrap argv normalization
    oauth.ts            -- OAuth 2.0 PKCE, refresh, revoke, write-scope checks
    pagination.ts       -- Cursor pagination helpers and include merging
    auth-bundle.ts      -- Portable auth bundle export/render/apply
    runtime.ts          -- In-memory config/token/MCP runtime flags
    tokens.ts           -- Token storage (~/.x-cli/tokens.json)
    env.ts              -- Config/dotenv loader and env schema
    help.ts             -- Help filtering for read-only mode
    utils.ts            -- Tweet ID parsing and username helpers
tests/
  *.test.ts             -- Vitest unit and CLI help tests
```

## Important Behaviors

- `x-cli` with no args starts MCP stdio mode.
- `auth export` emits unredacted OAuth credentials and tokens in normal CLI mode only.
- Auth export is blocked while serving MCP so an agent cannot reveal the server's own refresh token.
- Runtime MCP auth can be provided through `X_CLI_AUTH_JSON` or `--auth-json`; environment transport is preferred.
- Local config lives under `~/.x-cli/config.json`; tokens live under `~/.x-cli/tokens.json`.
- Config and token files are written with owner-only permissions.
- Default mode is `read-only`; write commands call `requireReadWriteMode()`.
- Switching to `read-write` with existing tokens re-runs OAuth and only persists the mode after required write scopes are granted.
- `auth logout` always deletes local tokens and attempts remote revocation only when OAuth app credentials are available.

## Development Commands

```bash
npm install
npm test
npm run lint
npm run build
npm run dev -- --help
```

Tests use Vitest. No test should call live X APIs.

## Adding Commands

1. Add the X API method in `lib/api.ts`.
2. Add the CLI command under the appropriate `commands/*.ts` module.
3. If the command writes to X, add the read-write guard and update the read-only help filtering list.
4. Add deterministic tests with mocked inputs/responses.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| "Not logged in" | No tokens found | Run `x-cli auth login` |
| Token refresh failed | Refresh token expired | Run `x-cli auth login` again |
| 401 Unauthorized | Bad or expired tokens | Check `x-cli auth status`, re-login if needed |
| 429 Rate Limited | Too many requests | Wait until the reset timestamp |
