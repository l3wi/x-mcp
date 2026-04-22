import { randomBytes, createHash } from "crypto";
import { spawn } from "node:child_process";
import { createServer, type IncomingMessage, type ServerResponse } from "http";
import { getConfigMode, type CliMode, type Env } from "./env.js";
import { saveTokens, loadTokens, isExpired, type StoredTokens } from "./tokens.js";
import {
  WRITE_SCOPES,
  assertRequiredWriteScopes,
  hasRequiredWriteScopes,
} from "./scopes.js";

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

type TokenTypeHint = "access_token" | "refresh_token";
type Fetcher = (
  input: URL | RequestInfo,
  init?: RequestInit,
) => Promise<Response>;
type OAuthTokenResponseContext = "Token exchange" | "Token refresh";

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

async function readJsonObject(
  resp: Response,
  context: OAuthTokenResponseContext,
): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await resp.json();
  } catch {
    throw new Error(`${context} response was not valid JSON.`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${context} response was not a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function requiredResponseString(
  value: unknown,
  context: OAuthTokenResponseContext,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${context} response missing ${field}.`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${context} response missing ${field}.`);
  }
  return trimmed;
}

function optionalResponseString(
  value: unknown,
  context: OAuthTokenResponseContext,
  field: string,
): string | undefined {
  if (value === undefined || value === null) return undefined;
  return requiredResponseString(value, context, field);
}

function parseTokenResponse(
  raw: Record<string, unknown>,
  context: OAuthTokenResponseContext,
  current?: StoredTokens,
): StoredTokens {
  const expiresIn = raw.expires_in;
  if (
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw new Error(`${context} response missing expires_in.`);
  }

  const refreshToken =
    optionalResponseString(raw.refresh_token, context, "refresh_token") ??
    current?.refresh_token;
  if (!refreshToken) {
    throw new Error(`${context} response missing refresh_token.`);
  }

  const scope =
    optionalResponseString(raw.scope, context, "scope") ??
    current?.scope;
  if (scope === undefined) {
    throw new Error(`${context} response missing scope.`);
  }

  return {
    access_token: requiredResponseString(raw.access_token, context, "access_token"),
    refresh_token: refreshToken,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    scope,
  };
}

function parseOAuthErrorBody(text: string): {
  code?: string;
  description: string;
} {
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const code = typeof parsed.error === "string" ? parsed.error : undefined;
      const descriptions = [
        parsed.error_description,
        parsed.errordescription,
        parsed.message,
        parsed.detail,
      ];
      const description = descriptions.find(
        (value): value is string => typeof value === "string" && value.trim().length > 0,
      );
      return {
        ...(code ? { code } : {}),
        description: description?.trim() ?? code ?? text,
      };
    }
  } catch {
    // Fall through to raw response text.
  }
  return { description: text.trim() || "Unknown OAuth error." };
}

function isInvalidRefreshTokenError(code: string | undefined, description: string): boolean {
  const normalizedCode = code?.toLowerCase().replace(/[^a-z_]/g, "");
  const normalizedDescription = description.toLowerCase();
  return (
    normalizedCode === "invalid_grant" ||
    normalizedCode === "invalid_request" ||
    normalizedCode === "invalidrequest" ||
    normalizedDescription.includes("token was invalid") ||
    normalizedDescription.includes("refresh token expired") ||
    normalizedDescription.includes("invalid refresh token")
  );
}

function formatOAuthError(
  context: OAuthTokenResponseContext,
  status: number,
  text: string,
): Error {
  const { code, description } = parseOAuthErrorBody(text);
  if (context === "Token refresh" && isInvalidRefreshTokenError(code, description)) {
    return new Error(
      [
        `Refresh token is no longer valid (${status}): ${description}`,
        "Run `x-cli auth login` to authorize again, or `x-cli auth login --read-write` if write access is needed.",
      ].join(" "),
    );
  }
  return new Error(`${context} failed (${status}): ${description}`);
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
    throw formatOAuthError("Token exchange", resp.status, text);
  }

  return parseTokenResponse(
    await readJsonObject(resp, "Token exchange"),
    "Token exchange",
  );
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
    throw formatOAuthError("Token refresh", resp.status, text);
  }

  const tokens = parseTokenResponse(
    await readJsonObject(resp, "Token refresh"),
    "Token refresh",
    current,
  );
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

  const resp = await fetcher(REVOKE_URL, {
    method: "POST",
    headers: tokenHeaders(env),
    body,
  });
  if (!resp.ok) {
    throw new Error(`Token revocation failed (${resp.status}).`);
  }
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
  const results = await Promise.allSettled(revocations);
  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error("One or more token revocations failed.");
  }
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
  assertRequiredWriteScopes,
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
