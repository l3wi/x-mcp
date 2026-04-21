import { Cli, z } from "incur";
import {
  envSchema,
  getConfigMode,
  optionalEnvSchema,
  resolveLoginEnv,
  setConfigMode,
  type Env,
} from "../lib/env.js";
import { renderAuthExport } from "../lib/auth-bundle.js";
import { assertRequiredWriteScopes, login, revokeToken } from "../lib/oauth.js";
import { loadTokens, deleteTokens } from "../lib/tokens.js";

export const auth = Cli.create("auth", {
  description: "Authentication commands",
});

auth.command("login", {
  description: "Authorize with your X account via OAuth 2.0 PKCE",
  options: z.object({
    readWrite: z
      .boolean()
      .default(false)
      .describe("Authorize in read-write mode and persist that mode"),
  }),
  async run(c) {
    const env = await resolveLoginEnv();
    const mode = c.options.readWrite ? "read-write" : getConfigMode();
    const tokens = await login(env, mode);
    if (mode === "read-write") {
      assertRequiredWriteScopes(tokens.scope);
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

auth.command("logout", {
  description: "Revoke tokens and log out",
  env: optionalEnvSchema,
  async run(c) {
    return logoutWithOptionalRevocation(c.env);
  },
});

auth.command("status", {
  description: "Show current auth status",
  run() {
    const tokens = loadTokens();
    const mode = getConfigMode();
    if (!tokens) {
      return { status: "not_logged_in", mode, message: "Run `x-cli auth login` to authenticate." };
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
