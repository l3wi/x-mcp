import { afterEach, describe, expect, test } from "vitest";
import {
  applyAuthBundleJson,
  createAuthBundle,
  persistAuthBundleJson,
  renderAuthBundle,
  renderAuthExport,
} from "../src/lib/auth-bundle.js";
import { getConfigMode } from "../src/lib/env.js";
import { clearRuntimeAuth, setRuntimeMcpServing } from "../src/lib/runtime.js";
import { loadTokens, saveTokens, type StoredTokens } from "../src/lib/tokens.js";

const originalClientId = process.env.X_CLIENT_ID;
const originalClientSecret = process.env.X_CLIENT_SECRET;
const originalAuthJson = process.env.X_CLI_AUTH_JSON;

function tokens(): StoredTokens {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_at: 1_900_000_000,
    scope: "tweet.read users.read offline.access",
  };
}

function writeTokens(): StoredTokens {
  return {
    ...tokens(),
    scope: "tweet.read users.read offline.access tweet.write like.write bookmark.write",
  };
}

function restoreEnv() {
  if (originalClientId === undefined) {
    delete process.env.X_CLIENT_ID;
  } else {
    process.env.X_CLIENT_ID = originalClientId;
  }
  if (originalClientSecret === undefined) {
    delete process.env.X_CLIENT_SECRET;
  } else {
    process.env.X_CLIENT_SECRET = originalClientSecret;
  }
  if (originalAuthJson === undefined) {
    delete process.env.X_CLI_AUTH_JSON;
  } else {
    process.env.X_CLI_AUTH_JSON = originalAuthJson;
  }
}

afterEach(() => {
  clearRuntimeAuth();
  restoreEnv();
});

describe("auth bundle", () => {
  test("creates a portable config and token bundle", () => {
    expect(
      createAuthBundle(
        {
          X_CLIENT_ID: "client",
          X_CLIENT_SECRET: "secret",
          mode: "read-write",
        },
        tokens(),
      ),
    ).toEqual({
      type: "x-cli-auth",
      version: 1,
      config: {
        X_CLIENT_ID: "client",
        X_CLIENT_SECRET: "secret",
        mode: "read-write",
      },
      tokens: tokens(),
    });
  });

  test("renders codex config with auth in environment", () => {
    const bundle = createAuthBundle({ X_CLIENT_ID: "client" }, tokens());
    const output = renderAuthBundle(bundle, "codex");

    expect(output).toContain("[mcp_servers.x_cli]");
    expect(output).toContain('command = "x-cli"');
    expect(output).toContain("X_CLI_AUTH_JSON");
    expect(output).toContain("startup_timeout_sec = 20");
  });

  test("renders json auth export as a single-line string", () => {
    const bundle = createAuthBundle({ X_CLIENT_ID: "client" }, tokens());
    const output = renderAuthBundle(bundle, "json");

    expect(output).toBe(JSON.stringify(bundle));
    expect(output).not.toContain("\n");
  });

  test("imports single-line json auth export", () => {
    const bundle = createAuthBundle({ X_CLIENT_ID: "client" }, tokens());
    const saved: Record<string, unknown> = {};

    persistAuthBundleJson(renderAuthBundle(bundle, "json"), {
      saveConfig(config) {
        saved.config = config;
      },
      saveTokens(tokens) {
        saved.tokens = tokens;
      },
    });

    expect(saved).toEqual({
      config: {
        X_CLIENT_ID: "client",
        mode: "read-only",
      },
      tokens: tokens(),
    });
  });

  test("normalizes token strings on import", () => {
    const saved: Record<string, unknown> = {};

    persistAuthBundleJson(
      JSON.stringify({
        type: "x-cli-auth",
        version: 1,
        config: {
          X_CLIENT_ID: "client",
          mode: "read-only",
        },
        tokens: {
          access_token: " access ",
          refresh_token: " refresh ",
          expires_at: 1_900_000_000,
          scope: " tweet.read users.read offline.access ",
        },
      }),
      {
        saveConfig(config) {
          saved.config = config;
        },
        saveTokens(tokens) {
          saved.tokens = tokens;
        },
      },
    );

    expect(saved.tokens).toEqual({
      access_token: "access",
      refresh_token: "refresh",
      expires_at: 1_900_000_000,
      scope: "tweet.read users.read offline.access",
    });
  });

  test("rejects empty token strings after trimming", () => {
    expect(() =>
      persistAuthBundleJson(
        JSON.stringify({
          type: "x-cli-auth",
          version: 1,
          config: {
            X_CLIENT_ID: "client",
            mode: "read-only",
          },
          tokens: {
            access_token: "   ",
            refresh_token: "refresh",
            expires_at: 1_900_000_000,
            scope: "tweet.read users.read offline.access",
          },
        }),
      )
    ).toThrow("tokens.access_token");
  });

  test("renders claude config with auth in environment", () => {
    const bundle = createAuthBundle({ X_CLIENT_ID: "client" }, tokens());
    const output = JSON.parse(renderAuthBundle(bundle, "claude")) as {
      mcpServers: Record<string, { command: string; env: Record<string, string> }>;
    };

    expect(output.mcpServers["x-cli"]?.command).toBe("x-cli");
    expect(output.mcpServers["x-cli"]?.env.X_CLI_AUTH_JSON).toContain(
      "\"type\":\"x-cli-auth\"",
    );
  });

  test("applies runtime auth without writing tokens to disk", () => {
    const bundle = createAuthBundle(
      {
        X_CLIENT_ID: "client",
        X_CLIENT_SECRET: "secret",
        mode: "read-only",
      },
      writeTokens(),
    );
    process.env.X_CLI_AUTH_JSON = JSON.stringify(bundle);

    applyAuthBundleJson(JSON.stringify(bundle), "read-write");

    expect(process.env.X_CLIENT_ID).toBe("client");
    expect(process.env.X_CLIENT_SECRET).toBe("secret");
    expect(getConfigMode()).toBe("read-write");
    expect(process.env.X_CLI_AUTH_JSON).toBeUndefined();
    expect(loadTokens()).toEqual(writeTokens());

    saveTokens({ ...writeTokens(), access_token: "new-access" });

    expect(loadTokens()?.access_token).toBe("new-access");
  });

  test("blocks local auth export while serving MCP", () => {
    setRuntimeMcpServing(true);

    expect(() => renderAuthExport("json")).toThrow(
      "Auth export is disabled while serving MCP.",
    );
  });

  test("rejects read-write runtime override without write token scopes", () => {
    const bundle = createAuthBundle(
      {
        X_CLIENT_ID: "client",
        mode: "read-only",
      },
      tokens(),
    );

    expect(() => applyAuthBundleJson(JSON.stringify(bundle), "read-write")).toThrow(
      "did not grant all required write scopes",
    );
  });

  test("persists imported auth bundle config and tokens", () => {
    const bundle = createAuthBundle(
      {
        X_CLIENT_ID: "client",
        X_CLIENT_SECRET: "secret",
        mode: "read-only",
      },
      writeTokens(),
    );
    const saved: Record<string, unknown> = {};

    const imported = persistAuthBundleJson(JSON.stringify(bundle), {
      modeOverride: "read-write",
      saveConfig(config) {
        saved.config = config;
      },
      saveTokens(tokens) {
        saved.tokens = tokens;
      },
    });

    expect(imported.config).toEqual({
      X_CLIENT_ID: "client",
      X_CLIENT_SECRET: "secret",
      mode: "read-write",
    });
    expect(saved).toEqual({
      config: {
        X_CLIENT_ID: "client",
        X_CLIENT_SECRET: "secret",
        mode: "read-write",
      },
      tokens: writeTokens(),
    });
  });
});
