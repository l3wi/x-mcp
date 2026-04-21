---
name: x-cli
description: Use x-cli and x-mcp to interact with X/Twitter API v2, inspect auth and permission state, and run read or write social commands safely.
---

# x-cli

Use `x-cli` for X/Twitter API v2 CLI actions. Use `x-mcp` only when configuring or running the MCP stdio server.

## Discover Commands

Start with the built-in command references:

```bash
x-cli --help
x-cli <group> --help
x-cli --llms
x-cli --llms-full
x-cli <command> --schema
```

Use `--schema` before calling an unfamiliar command. Prefer `--json` or `--format json` when you need structured output.

## Check Auth And Permissions

Before account-specific work, check:

```bash
x-cli auth status
x-cli config show
```

Interpret the result:

- `auth status` shows whether tokens are active, expired, refreshable, and what OAuth scopes were granted.
- `config show` shows `read-only` or `read-write` mode.
- Write actions require `read-write` mode and matching write scopes such as `tweet.write`, `like.write`, or `bookmark.write`.

If not logged in:

```bash
x-cli auth login
```

If the user explicitly wants write actions:

```bash
x-cli auth login --read-write
x-cli config mode read-write
```

Return to safer read-only mode with:

```bash
x-cli config mode read-only
```

## Safe Defaults

Use read commands by default:

```bash
x-cli tweet get <id-or-url>
x-cli tweet search "<query>" --limit 20
x-cli tweet thread <id-or-url>
x-cli tweet context <id-or-url> --max 10
x-cli user get <username>
x-cli user timeline <username> --limit 10
x-cli user followers <username> --limit 50
x-cli user following <username>
x-cli me mentions --limit 20
x-cli me bookmarks --limit 20
```

Use pagination options where available:

```bash
--limit <n>
--page-size <n>
--cursor <next_cursor>
--offset <n>
```

Reduce large outputs with:

```bash
--filter-output data.text
--token-limit <n>
--token-offset <n>
```

## Write Commands

Only run write commands when the user explicitly asks for that specific action and after verifying read-write mode and scopes:

```bash
x-cli tweet post "<text>"
x-cli tweet delete <id-or-url>
x-cli tweet reply <id-or-url> "<text>"
x-cli tweet quote <id-or-url> "<text>"
x-cli me bookmark <id-or-url>
x-cli me unbookmark <id-or-url>
x-cli like <id-or-url>
x-cli retweet <id-or-url>
```

Programmatic replies, likes, bookmarks, and metrics may depend on the user's current X API plan and app permissions. If an API error mentions permission, tier, or rate limits, report that clearly and do not retry aggressively.

## MCP

For MCP setup, use `x-mcp`, not bare `x-cli`:

```bash
x-mcp mcp add
x-mcp
```

`x-cli` with no arguments prints CLI help. Bare `x-mcp` starts the MCP stdio server and waits for MCP messages.

Export local auth for an MCP environment from normal CLI mode:

```bash
x-cli auth export json
x-cli auth export codex
x-cli auth export claude
```

Auth exports contain OAuth credentials and refresh tokens. Do not paste them into public issues, logs, or model-visible transcripts. Prefer passing them via `X_CLI_AUTH_JSON` or a client-managed secret store.

To restore an exported JSON bundle into local config and token files, use:

```bash
x-cli auth import '<one-line-auth-json>'
x-cli auth import "$(x-cli auth export json)"
x-cli auth import --file x-cli-auth.json
x-cli auth export json | x-cli auth import
```

Quote JSON when passing it as an argument so the shell keeps it as one value. Use `x-cli auth import --mode read-only` to force safer local mode. Only use `--mode read-write` when the user explicitly wants write actions and the imported token scopes include the required write scopes.
