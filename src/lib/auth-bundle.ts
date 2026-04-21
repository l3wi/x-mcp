import {
  getConfigMode,
  getEnvFromProcess,
  loadConfigJson,
  type CliMode,
  type ConfigJson,
} from "./env.js";
import { loadTokens, type StoredTokens } from "./tokens.js";
import {
  isRuntimeMcpServing,
  setRuntimeConfig,
  setRuntimeTokens,
} from "./runtime.js";
import { assertRequiredWriteScopes } from "./scopes.js";

const AUTH_BUNDLE_TYPE = "x-cli-auth";
const AUTH_BUNDLE_VERSION = 1;
const EXPORT_FORMATS = ["json", "codex", "claude"] as const;

export type AuthExportFormat = (typeof EXPORT_FORMATS)[number];

export interface AuthBundle {
  type: typeof AUTH_BUNDLE_TYPE;
  version: typeof AUTH_BUNDLE_VERSION;
  config: ConfigJson & { X_CLIENT_ID: string; mode: CliMode };
  tokens: StoredTokens;
}

export function isAuthExportFormat(value: string): value is AuthExportFormat {
  return EXPORT_FORMATS.includes(value as AuthExportFormat);
}

export function createAuthBundle(
  config: ConfigJson | null,
  tokens: StoredTokens | null,
): AuthBundle {
  if (!config?.X_CLIENT_ID) {
    throw new Error("Missing X OAuth config. Run `x-cli auth login` first.");
  }
  if (!tokens) {
    throw new Error("Missing X OAuth tokens. Run `x-cli auth login` first.");
  }

  return {
    type: AUTH_BUNDLE_TYPE,
    version: AUTH_BUNDLE_VERSION,
    config: {
      X_CLIENT_ID: config.X_CLIENT_ID,
      ...(config.X_CLIENT_SECRET
        ? { X_CLIENT_SECRET: config.X_CLIENT_SECRET }
        : {}),
      mode: normalizeMode(config.mode),
    },
    tokens,
  };
}

export function loadLocalAuthBundle(): AuthBundle {
  const fileConfig = loadConfigJson() ?? {};
  const env = getEnvFromProcess();
  const config: ConfigJson = {
    ...fileConfig,
    ...(env ?? {}),
    mode: getConfigMode(),
  };
  return createAuthBundle(config, loadTokens());
}

export function parseAuthBundleJson(json: string): AuthBundle {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("Invalid auth JSON. Expected an x-cli auth bundle.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid auth JSON. Expected an x-cli auth bundle object.");
  }

  const bundle = parsed as {
    type?: unknown;
    version?: unknown;
    config?: unknown;
    tokens?: unknown;
  };
  if (
    bundle.type !== AUTH_BUNDLE_TYPE ||
    bundle.version !== AUTH_BUNDLE_VERSION
  ) {
    throw new Error("Invalid auth JSON. Expected type `x-cli-auth` version 1.");
  }
  return createAuthBundle(
    validateConfig(bundle.config),
    validateTokens(bundle.tokens),
  );
}

export function applyAuthBundleJson(
  json: string,
  modeOverride?: CliMode,
): AuthBundle {
  const bundle = parseAuthBundleJson(json);
  const config = {
    ...bundle.config,
    mode: modeOverride ?? bundle.config.mode,
  };
  const applied = createAuthBundle(config, bundle.tokens);
  if (applied.config.mode === "read-write") {
    assertRequiredWriteScopes(applied.tokens.scope);
  }

  setRuntimeConfig(applied.config);
  setRuntimeTokens(applied.tokens);
  delete process.env.X_CLI_AUTH_JSON;
  process.env.X_CLIENT_ID = applied.config.X_CLIENT_ID;
  if (applied.config.X_CLIENT_SECRET) {
    process.env.X_CLIENT_SECRET = applied.config.X_CLIENT_SECRET;
  } else {
    delete process.env.X_CLIENT_SECRET;
  }

  return applied;
}

export function renderAuthExport(format: AuthExportFormat): string {
  if (isRuntimeMcpServing()) {
    throw new Error("Auth export is disabled while serving MCP.");
  }
  return renderAuthBundle(loadLocalAuthBundle(), format);
}

export function renderAuthBundle(
  bundle: AuthBundle,
  format: AuthExportFormat,
): string {
  if (format === "json") return JSON.stringify(bundle, null, 2);

  const authJson = JSON.stringify(bundle);
  if (format === "codex") {
    return [
      "[mcp_servers.x_cli]",
      'command = "x-cli"',
      `env = { X_CLI_AUTH_JSON = ${JSON.stringify(authJson)} }`,
      "startup_timeout_sec = 20",
      "tool_timeout_sec = 45",
      "enabled = true",
    ].join("\n");
  }

  return JSON.stringify(
    {
      mcpServers: {
        "x-cli": {
          type: "stdio",
          command: "x-cli",
          env: {
            X_CLI_AUTH_JSON: authJson,
          },
        },
      },
    },
    null,
    2,
  );
}

function normalizeMode(mode: unknown): CliMode {
  return mode === "read-write" ? "read-write" : "read-only";
}

function validateConfig(config: unknown): ConfigJson {
  if (!config || typeof config !== "object") {
    throw new Error("Invalid auth JSON. Missing config object.");
  }
  const raw = config as Record<string, unknown>;
  return {
    X_CLIENT_ID: expectString(raw.X_CLIENT_ID, "config.X_CLIENT_ID"),
    ...(typeof raw.X_CLIENT_SECRET === "string"
      ? { X_CLIENT_SECRET: raw.X_CLIENT_SECRET }
      : {}),
    mode: normalizeMode(raw.mode),
  };
}

function validateTokens(tokens: unknown): StoredTokens {
  if (!tokens || typeof tokens !== "object") {
    throw new Error("Invalid auth JSON. Missing tokens object.");
  }
  const raw = tokens as Record<string, unknown>;
  return {
    access_token: expectString(raw.access_token, "tokens.access_token"),
    refresh_token: expectString(raw.refresh_token, "tokens.refresh_token"),
    expires_at: expectNumber(raw.expires_at, "tokens.expires_at"),
    scope: expectString(raw.scope, "tokens.scope"),
  };
}

function expectString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid auth JSON. Missing ${label}.`);
  }
  return value;
}

function expectNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid auth JSON. Missing ${label}.`);
  }
  return value;
}
