# x-mcp

`x-mcp` is a Node.js CLI and MCP stdio server for X/Twitter API v2. It can read timelines, search tweets, post, like, retweet, manage bookmarks, and expose the same command surface to MCP-capable agents.

Built with [incur](https://github.com/wevm/incur), TypeScript, and OAuth 2.0 PKCE.

## Quickstart

Requires Node.js 20 or newer.

```bash
npm install -g x-mcp
x-mcp --help
x-mcp auth login
```

Run once without installing:

```bash
npx x-mcp --help
```

Running `x-mcp` with no arguments starts the MCP stdio server. Use `x-mcp` as the command in MCP clients that support stdio servers.

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
x-mcp auth login
```

If credentials are not already configured, `x-mcp auth login` prompts for them. The CLI creates `~/.x-mcp`, saves credentials to `~/.x-mcp/config.json` with owner-only permissions, opens your browser, and stores tokens at `~/.x-mcp/tokens.json`.

You can also create `~/.x-mcp/config.json` manually:

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
x-mcp config show
x-mcp config mode read-write
```

If existing tokens do not include write scopes, switching to `read-write` re-runs OAuth and only persists the new mode after X grants the required write scopes. Disable writes again with:

```bash
x-mcp config mode read-only
```

## CLI Usage

### Tweets

```bash
x-mcp tweet post "Hello world"
x-mcp tweet post --poll "Yes,No" "Do you like polls?"
x-mcp tweet get <id-or-url>
x-mcp tweet delete <id-or-url>
x-mcp tweet reply <id-or-url> "nice post"
x-mcp tweet quote <id-or-url> "this is important"
x-mcp tweet search "machine learning" --limit 20
x-mcp tweet metrics <id-or-url>
x-mcp tweet thread <id-or-url>
x-mcp tweet context <id-or-url> --max 10
```

### Users

```bash
x-mcp user get elonmusk
x-mcp user timeline elonmusk --limit 10
x-mcp user followers elonmusk --limit 50
x-mcp user following elonmusk
```

### Self and Quick Actions

```bash
x-mcp me mentions --limit 20
x-mcp me bookmarks --limit 20
x-mcp me bookmark <id-or-url>
x-mcp me unbookmark <id-or-url>
x-mcp like <id-or-url>
x-mcp retweet <id-or-url>
```

All tweet commands accept tweet URLs (`https://x.com/user/status/123`) or raw IDs (`123`).

### Pagination and Output

```bash
x-mcp me bookmarks --limit 50 --page-size 10
x-mcp me bookmarks --cursor <next_cursor>
x-mcp tweet get <id> --json
x-mcp tweet get <id> --format yaml
x-mcp tweet get <id> --filter-output data.text
```

Default output is TOON. Incur also provides `--format toon|json|yaml|md|jsonl`, `--json`, `--verbose`, token controls, and schema/manifest flags.

## Agent Integration

Register `x-mcp` as an MCP stdio server:

```bash
x-mcp mcp add
```

Or configure the direct server command:

```bash
x-mcp
```

Export local auth for MCP server environments from normal CLI mode:

```bash
x-mcp auth export json
x-mcp auth export codex
x-mcp auth export claude
```

`auth export` includes OAuth credentials and tokens. It is blocked while `x-mcp` is serving MCP so an agent cannot ask the server to reveal its own refresh token. Prefer passing exported auth through `X_MCP_AUTH_JSON`:

```bash
X_MCP_AUTH_JSON='<auth-bundle-json>' x-mcp
```

`--auth-json '<auth-bundle-json>'` is still accepted for local testing, but avoid it in shared systems because process arguments can leak through shell history, logs, and process listings.

Machine-readable manifests:

```bash
x-mcp --llms
x-mcp --llms-full
```

## Command Reference

| Command | Description |
|---------|-------------|
| `auth login` | Authorize via OAuth 2.0 PKCE |
| `auth logout` | Revoke tokens when possible and always delete local tokens |
| `auth status` | Show token expiry and scopes |
| `auth export <json\|codex\|claude>` | Export portable MCP auth bundle or client config |
| `config show` | Show current CLI configuration |
| `config mode <read-only\|read-write>` | Switch read/write mode |
| `tweet post <text>` | Post a tweet |
| `tweet get <id>` | Fetch a tweet |
| `tweet delete <id>` | Delete a tweet |
| `tweet reply <id> <text>` | Reply to a tweet |
| `tweet quote <id> <text>` | Quote tweet |
| `tweet search <query>` | Search recent tweets |
| `tweet metrics <id>` | Get engagement metrics |
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
| `~/.x-mcp/config.json` | OAuth app credentials and `read-only` or `read-write` mode |
| `~/.x-mcp/.env` | Optional credential environment file |
| Current directory `.env` | Optional dotenv fallback for local development |
| `~/.x-mcp/tokens.json` | OAuth access and refresh tokens |
| `X_MCP_AUTH_JSON` | Runtime-only MCP auth bundle |

Config and token files are written with owner-only permissions. Never paste auth exports into public issues, shared logs, or model-visible transcripts.

## X API Access Notes

X API plan limits, pricing, and endpoint availability change over time. If a command returns a permission, tier, or rate-limit error, check the current X API docs and your developer portal plan before assuming the CLI is misconfigured.

Some commands require user-context OAuth scopes and may also require paid API access depending on X's current policy. This is most common for write actions, likes, bookmarks, private metrics, and advanced search operators.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "Not logged in" | Run `x-mcp auth login` |
| Token refresh fails | Refresh token expired. Run `x-mcp auth login` again. |
| 401 Unauthorized | Check `x-mcp auth status`. Re-login if needed. |
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
