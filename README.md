# x-cli

`x-cli` is a Node.js CLI for X/Twitter API v2, with a companion `x-mcp`
stdio server for MCP-capable agents. It can read timelines, search tweets,
post, like, retweet, manage bookmarks, and expose the same command surface to
agents.

Built with [incur](https://github.com/wevm/incur), TypeScript, and OAuth 2.0 PKCE.

## Quickstart

Requires Node.js 20 or newer.

```bash
npm install -g @lewi/x-cli
x-cli --help
x-cli auth login
```

Run once without installing:

```bash
npx @lewi/x-cli --help
```

Running `x-cli` with no arguments prints CLI help. Use `x-mcp` as the command in
MCP clients that support stdio servers; bare `x-mcp` starts the MCP stdio
server.

In MCP mode, local administration commands that can mutate auth or config state
are not exposed as tools. Read-only mode also hides write tools; switch to
`read-write` mode with tokens that include write scopes before starting the MCP
server if you want posting, liking, retweeting, or bookmark mutation tools.

## CLI Setup

### 1. Create an X Developer App

1. Go to the [X Developer Portal](https://developer.x.com/en/portal/dashboard)
2. Create an app, or use an existing one
3. Under **User authentication settings**:
   - Enable **OAuth 2.0**
   - Set type to **Native App** or **Web App**
   - Add callback URL: `http://127.0.0.1:8741/callback`
4. Copy your **Client ID** and, for confidential clients, your **Client Secret**

### 2. Log In

```bash
x-cli auth login
```

If credentials are not already configured, `x-cli auth login` prompts for them. The CLI creates `~/.x-cli`, saves credentials to `~/.x-cli/config.json` with owner-only permissions, opens your browser, and stores tokens at `~/.x-cli/tokens.json`.

You can also create `~/.x-cli/config.json` manually:

```json
{
  "X_CLIENT_ID": "your_client_id",
  "X_CLIENT_SECRET": "your_client_secret",
  "mode": "read-only"
}
```

For public/native apps, omit `X_CLIENT_SECRET`.

The CLI defaults to `read-only` mode. Enable write actions only when you need posting, deleting, liking, retweeting, or bookmarking:

```bash
x-cli config show
x-cli config mode read-write
```

Run `x-cli auth login --read-write` if you are not already logged in. If
existing tokens do not include write scopes, switching to `read-write` re-runs
OAuth and only persists the new mode after X grants the required write scopes.
Disable writes again with:

```bash
x-cli config mode read-only
```

## CLI Usage

### Tweets

```bash
x-cli tweet post "Hello world"
x-cli tweet post --poll "Yes,No" "Do you like polls?"
x-cli tweet get <id-or-url>
x-cli tweet delete <id-or-url>
x-cli tweet reply <id-or-url> "nice post"
x-cli tweet quote <id-or-url> "this is important"
x-cli tweet search "machine learning" --limit 20
x-cli tweet metrics <id-or-url>
x-cli tweet thread <id-or-url>
x-cli tweet context <id-or-url> --max 10
```

### Users

```bash
x-cli user get elonmusk
x-cli user timeline elonmusk --limit 10
x-cli user followers elonmusk --limit 50
x-cli user following elonmusk
```

### Self and Quick Actions

```bash
x-cli me mentions --limit 20
x-cli me bookmarks --limit 20
x-cli me bookmark <id-or-url>
x-cli me unbookmark <id-or-url>
x-cli like <id-or-url>
x-cli retweet <id-or-url>
```

All tweet commands accept tweet URLs (`https://x.com/user/status/123`) or raw IDs (`123`).

### Pagination and Output

```bash
x-cli me bookmarks --limit 50 --page-size 10
x-cli me bookmarks --cursor <next_cursor>
x-cli tweet get <id> --json
x-cli tweet get <id> --format yaml
x-cli tweet get <id> --filter-output data.text
```

Default output is TOON. Incur also provides `--format toon|json|yaml|md|jsonl`, `--json`, `--verbose`, token controls, and schema/manifest flags.

## Agent Integration

Register the MCP stdio server:

```bash
x-mcp mcp add
```

Or configure the direct server command:

```bash
x-mcp
```

Export local auth for MCP server environments from normal CLI mode:

```bash
x-cli auth export json
x-cli auth export codex
x-cli auth export claude
```

`auth export` includes OAuth credentials and tokens. It is blocked while `x-cli` is serving MCP so an agent cannot ask the server to reveal its own refresh token. Prefer passing exported auth through `X_CLI_AUTH_JSON`:

```bash
X_CLI_AUTH_JSON='<auth-bundle-json>' x-mcp
```

`--auth-json '<auth-bundle-json>'` is still accepted for local testing, but avoid it in shared systems because process arguments can leak through shell history, logs, and process listings.
This flag is deprecated; prefer `X_CLI_AUTH_JSON` or a client-managed secret
store for MCP server configuration.

Import an exported JSON bundle into local config and token files:

```bash
x-cli auth export json > x-cli-auth.json
x-cli auth import --file x-cli-auth.json
x-cli auth import '<one-line-auth-json>'
x-cli auth import "$(x-cli auth export json)"
x-cli auth export json | x-cli auth import
```

Use `--mode read-only` or `--mode read-write` to override the mode stored in
the bundle. Read-write imports are rejected unless the imported tokens include
the required write scopes. Quote JSON when passing it as an argument so your
shell keeps it as one value.

Machine-readable manifests:

```bash
x-cli --llms
x-cli --llms-full
```

### Install as an Agent Skill

Install the curated `x-cli` skill from GitHub with skills.sh:

```bash
npx skills add l3wi/x-mcp
```

If your skills CLI asks for a nested skill name, use:

```bash
npx skills add l3wi/x-mcp --skill x-cli
```

skills.sh collects anonymous install telemetry for discovery and leaderboard
features. To opt out for a single install:

```bash
DISABLE_TELEMETRY=1 npx skills add l3wi/x-mcp
```

If `x-cli` is already installed locally, you can also generate and sync
command-specific agent skills from the current CLI definitions:

```bash
x-cli skills add
x-cli skills add --no-global
```

## Command Reference

| Command | Description |
|---------|-------------|
| `auth login` | Authorize via OAuth 2.0 PKCE |
| `auth logout` | Revoke tokens when possible and always delete local tokens |
| `auth status` | Show token expiry and scopes |
| `auth export <json\|codex\|claude>` | Export portable MCP auth bundle or client config |
| `auth import [json]` | Import an auth bundle into local config and tokens |
| `config show` | Show current CLI configuration |
| `config mode <read-only\|read-write>` | Switch read/write mode |
| `tweet post <text>` | Post a tweet |
| `tweet get <id>` | Fetch a tweet |
| `tweet delete <id>` | Delete a tweet |
| `tweet reply <id> <text>` | Reply to a tweet |
| `tweet quote <id> <text>` | Quote tweet |
| `tweet search <query>` | Search recent tweets |
| `tweet metrics <id>` | Get public engagement metrics |
| `tweet thread <id>` | Fetch compact context: target, root, and quoted tweets |
| `tweet context <id>` | Fetch target plus recent conversation tweets |
| `user get <username>` | Look up a user profile |
| `user timeline <username>` | Fetch recent tweets |
| `user followers <username>` | List followers |
| `user following <username>` | List following |
| `me mentions` | Fetch your mentions |
| `me bookmarks` | Fetch your bookmarks |
| `me bookmark <id>` | Bookmark a tweet |
| `me unbookmark <id>` | Remove a bookmark |
| `like <id>` | Like a tweet |
| `retweet <id>` | Retweet a tweet |

## Configuration

| Location | Purpose |
|----------|---------|
| `~/.x-cli/config.json` | OAuth app credentials and `read-only` or `read-write` mode |
| `~/.x-cli/.env` | Optional credential environment file |
| Current directory `.env` | Optional dotenv fallback for local development |
| `~/.x-cli/tokens.json` | OAuth access and refresh tokens |
| `X_CLI_AUTH_JSON` | Runtime-only MCP auth bundle |

Config and token files are written with owner-only permissions. Never paste auth exports into public issues, shared logs, or model-visible transcripts.

## X API Access Notes

X API plan limits, pricing, and endpoint availability change over time. If a command returns a permission, tier, or rate-limit error, check the current X API docs and your developer portal plan before assuming the CLI is misconfigured.

Some commands require user-context OAuth scopes and may also require paid API access depending on X's current policy. This is most common for write actions, likes, bookmarks, private metrics, and advanced search operators.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Not logged in" | Run `x-cli auth login` |
| Token refresh fails | Refresh token expired. Run `x-cli auth login` again. |
| 401 Unauthorized | Check `x-cli auth status`. Re-login if needed. |
| Reply fails | X restricts programmatic replies. Use `tweet quote` instead. |
| 429 Rate Limited | Error includes reset timestamp. Wait it out. |
| Search operator error | Some operators need additional X API access. |

## Development

```bash
npm install
npm test
npm run lint
npm run build
npm run dev -- --help
```

## License

MIT
