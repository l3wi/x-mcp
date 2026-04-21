import { randomBytes, createHash } from "crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { getConfigMode, type CliMode, type Env } from "./env.js";
import { saveTokens, loadTokens, isExpired, type StoredTokens } from "./tokens.js";

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const REVOKE_URL = "https://api.x.com/2/oauth2/revoke";
const REDIRECT_URI = "http://127.0.0.1:8741/callback";

const READ_SCOPES = [
  "tweet.read",
  "users.read",
  "follows.read",
  "like.read",
  "bookmark.read",
  "offline.access",
];

const WRITE_SCOPES = [
  "tweet.write",
  "like.write",
  "bookmark.write",
];

type TokenTypeHint = "access_token" | "refresh_token";
type Fetcher = (
  input: URL | RequestInfo,
  init?: RequestInit,
) => Promise<Response>;

function base64url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function scopesForMode(mode: CliMode): string {
  const scopes = mode === "read-write"
    ? [...READ_SCOPES, ...WRITE_SCOPES]
    : READ_SCOPES;
  return scopes.join(" ");
}

function hasRequiredWriteScopes(scope: string): boolean {
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return WRITE_SCOPES.every((requiredScope) => granted.has(requiredScope));
}

export function assertRequiredWriteScopes(scope: string): void {
  if (hasRequiredWriteScopes(scope)) return;
  throw new Error(
    "X did not grant all required write scopes. Re-run `x-cli auth login --read-write` after checking your app permissions.",
  );
}

function buildAuthUrl(
  clientId: string,
  state: string,
  challenge: string,
  mode: CliMode = "read-only",
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    scope: scopesForMode(mode),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params}`;
}

function basicAuth(env: Env): string | null {
  if (!env.X_CLIENT_SECRET) return null;
  return Buffer.from(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`).toString("base64");
}

function tokenHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  const auth = basicAuth(env);
  if (auth) headers["Authorization"] = `Basic ${auth}`;
  return headers;
}

async function waitForCallback(
  state: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1:8741`);
      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end();
        return;
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<h1>Authorization failed</h1><p>${error}</p><p>You can close this tab.</p>`);
        server.close();
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      if (returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>State mismatch</h1><p>Possible CSRF attack. Please try again.</p>");
        server.close();
        reject(new Error("State mismatch"));
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end("<h1>Missing code</h1><p>No authorization code received.</p>");
        server.close();
        reject(new Error("Missing authorization code"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        "<h1>Authorized!</h1><p>You can close this tab and return to your terminal.</p>",
      );
      server.close();
      resolve(code);
    });

    server.listen(8741, "127.0.0.1");
    server.on("error", (err) => {
      reject(new Error(`Failed to start callback server: ${err.message}`));
    });
  });
}

async function exchangeCode(
  code: string,
  verifier: string,
  env: Env,
): Promise<StoredTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
    ...(env.X_CLIENT_SECRET ? {} : { client_id: env.X_CLIENT_ID }),
  });

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: tokenHeaders(env),
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    scope: data.scope,
  };
}

export async function login(
  env: Env,
  mode: CliMode = getConfigMode(),
  options: { saveTokens?: boolean } = {},
): Promise<StoredTokens> {
  const { verifier, challenge } = generatePKCE();
  const state = base64url(randomBytes(16));
  const authUrl = buildAuthUrl(env.X_CLIENT_ID, state, challenge, mode);

  console.log(`\nAuthorizing in ${mode} mode.`);
  console.log(`\nOpen this URL in your browser to authorize:\n\n  ${authUrl}\n`);

  try {
    openBrowser(authUrl);
  } catch {
    // User can open manually
  }

  console.log("Waiting for authorization...");
  const code = await waitForCallback(state);
  const tokens = await exchangeCode(code, verifier, env);
  if (options.saveTokens ?? true) {
    saveTokens(tokens);
  }
  return tokens;
}

export async function refreshAccessToken(env: Env): Promise<StoredTokens> {
  const current = loadTokens();
  if (!current?.refresh_token) {
    throw new Error("No refresh token found. Run `x-cli auth login` first.");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: current.refresh_token,
    ...(env.X_CLIENT_SECRET ? {} : { client_id: env.X_CLIENT_ID }),
  });

  const resp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: tokenHeaders(env),
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Token refresh failed (${resp.status}): ${text}`);
  }

  const data = await resp.json() as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  const tokens: StoredTokens = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
    scope: data.scope,
  };
  saveTokens(tokens);
  return tokens;
}

async function revokeOAuthToken(
  env: Env,
  token: string,
  tokenTypeHint: TokenTypeHint,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const body = new URLSearchParams({
    token,
    token_type_hint: tokenTypeHint,
    ...(env.X_CLIENT_SECRET ? {} : { client_id: env.X_CLIENT_ID }),
  });

  await fetcher(REVOKE_URL, {
    method: "POST",
    headers: tokenHeaders(env),
    body,
  });
}

async function revokeStoredTokens(
  env: Env,
  tokens: StoredTokens,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const revocations = [
    revokeOAuthToken(env, tokens.access_token, "access_token", fetcher),
    revokeOAuthToken(env, tokens.refresh_token, "refresh_token", fetcher),
  ];
  await Promise.allSettled(revocations);
}

export async function revokeToken(env: Env): Promise<void> {
  const current = loadTokens();
  if (!current) return;

  await revokeStoredTokens(env, current); // Best-effort remote revocation
}

export async function getAccessToken(env: Env): Promise<string> {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error("Not logged in. Run `x-cli auth login` first.");
  }
  if (isExpired(tokens)) {
    const refreshed = await refreshAccessToken(env);
    return refreshed.access_token;
  }
  return tokens.access_token;
}

// Re-export for convenience
export {
  buildAuthUrl as _buildAuthUrl,
  generatePKCE as _generatePKCE,
  hasRequiredWriteScopes as _hasRequiredWriteScopes,
  revokeStoredTokens as _revokeStoredTokens,
};

function openBrowser(url: string): void {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["/c", "start", "", url]
      : [url];

  spawn(command, args, {
    detached: true,
    stdio: "ignore",
  }).unref();
}
