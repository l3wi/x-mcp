import { Cli, z } from "incur";
import { readFile } from "fs/promises";
import {
  envSchema,
  getConfigMode,
  optionalEnvSchema,
  resolveLoginEnv,
  setConfigMode,
  type Env,
} from "../lib/env.js";
import { persistAuthBundleJson, renderAuthExport } from "../lib/auth-bundle.js";
import { assertRequiredWriteScopes, login, revokeToken } from "../lib/oauth.js";
import { loadTokens, deleteTokens, saveTokens } from "../lib/tokens.js";

export interface AuthCommandOptions {
  includeLogin?: boolean;
  includeLogout?: boolean;
  includeExport?: boolean;
  includeImport?: boolean;
}

export interface AuthImportInputOptions {
  json?: string | undefined;
  file?: string | undefined;
  readStdin?: (() => Promise<string>) | undefined;
}

export function createAuthCommand(options: AuthCommandOptions = {}) {
  const {
    includeLogin = true,
    includeLogout = true,
    includeExport = true,
    includeImport = true,
  } = options;
  const auth = Cli.create("auth", {
    description: "Authentication commands",
  });

  if (includeLogin) {
    auth.command("login", {
      description: "Authorize with your X account via OAuth 2.0 PKCE",
      options: z.object({
        readWrite: z
          .boolean()
          .default(false)
          .describe("Authorize in read-write mode and persist that mode"),
        manual: z
          .boolean()
          .default(false)
          .describe("Paste the callback URL instead of waiting on localhost"),
      }),
      async run(c) {
        const env = await resolveLoginEnv();
        const mode = c.options.readWrite ? "read-write" : getConfigMode();
        const tokens = await login(env, mode, {
          saveTokens: mode !== "read-write",
          manualCallback: c.options.manual,
        });
        if (mode === "read-write") {
          assertRequiredWriteScopes(tokens.scope);
          saveTokens(tokens);
          setConfigMode("read-write");
        }
        return {
          status: "logged_in",
          mode,
          scope: tokens.scope,
          expires_at: new Date(tokens.expires_at * 1000).toISOString(),
        };
      },
    });
  }

  if (includeLogout) {
    auth.command("logout", {
      description: "Revoke tokens and log out",
      env: optionalEnvSchema,
      async run(c) {
        return logoutWithOptionalRevocation(c.env);
      },
    });
  }

  auth.command("status", {
    description: "Show current auth status",
    run() {
      const tokens = loadTokens();
      const mode = getConfigMode();
      if (!tokens) {
        return {
          status: "not_logged_in",
          mode,
          message: "Run `x-cli auth login` to authenticate.",
        };
      }

      const now = Date.now() / 1000;
      const expiresAt = new Date(tokens.expires_at * 1000).toISOString();
      const expired = now >= tokens.expires_at;
      const refreshable = !!tokens.refresh_token;

      return {
        status: expired ? "expired" : "active",
        mode,
        expires_at: expiresAt,
        expired,
        refreshable,
        scope: tokens.scope,
      };
    },
  });

  if (includeExport) {
    auth.command("export", {
      description: "Export config and tokens for server MCP usage",
      args: z.object({
        format: z
          .enum(["json", "codex", "claude"])
          .default("json")
          .describe("Export format"),
      }),
      run(c) {
        return renderAuthExport(c.args.format);
      },
    });
  }

  if (includeImport) {
    auth.command("import", {
      description: "Import an x-cli auth bundle into local config and tokens",
      args: z.object({
        json: z
          .string()
          .optional()
          .describe("Auth bundle JSON. If omitted, reads from --file or stdin"),
      }),
      options: z.object({
        file: z.string().optional().describe("Path to an auth bundle JSON file"),
        mode: z
          .enum(["read-only", "read-write"])
          .optional()
          .describe("Override imported CLI mode"),
      }),
      async run(c) {
        const json = await readAuthImportInput({
          json: c.args.json,
          file: c.options.file,
        });
        const bundle = persistAuthBundleJson(json, {
          modeOverride: c.options.mode,
        });

        return {
          status: "imported",
          mode: bundle.config.mode,
          client_id_configured: true,
          client_secret_configured: !!bundle.config.X_CLIENT_SECRET,
          scope: bundle.tokens.scope,
          expires_at: new Date(bundle.tokens.expires_at * 1000).toISOString(),
        };
      },
    });
  }

  return auth;
}

export const auth = createAuthCommand();

export async function logoutWithOptionalRevocation(env: Partial<Env>) {
  let remoteRevocation:
    | "revoked"
    | "skipped_missing_credentials"
    | "failed" = "skipped_missing_credentials";
  const parsedEnv = envSchema.safeParse(env);

  try {
    if (parsedEnv.success) {
      await revokeToken(parsedEnv.data);
      remoteRevocation = "revoked";
    }
  } catch {
    remoteRevocation = "failed";
  } finally {
    deleteTokens();
  }

  return {
    status: "logged_out",
    local_tokens: "deleted",
    remote_revocation: remoteRevocation,
  };
}

export async function readAuthImportInput(
  options: AuthImportInputOptions,
): Promise<string> {
  const sources = [
    options.json !== undefined,
    options.file !== undefined,
  ].filter(Boolean).length;
  if (sources > 1) {
    throw new Error(
      "Pass auth JSON either as an argument, via --file, or via stdin.",
    );
  }

  if (options.json !== undefined) return options.json;
  if (options.file !== undefined) return readFile(options.file, "utf8");

  const readStdin = options.readStdin ?? readStdinText;
  const input = await readStdin();
  if (!input.trim()) {
    throw new Error(
      "Missing auth JSON. Pass JSON, use --file, or pipe `x-cli auth export json` into this command.",
    );
  }
  return input;
}

async function readStdinText(): Promise<string> {
  const stdin = process.stdin as NodeJS.ReadStream;
  if (stdin.isTTY) {
    throw new Error(
      "Missing auth JSON. Pass JSON, use --file, or pipe `x-cli auth export json` into this command.",
    );
  }

  stdin.setEncoding("utf8");
  let data = "";
  for await (const chunk of stdin) {
    data += chunk;
  }
  return data;
}
