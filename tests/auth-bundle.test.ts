import { afterEach, describe, expect, test } from "vitest";
import {
  applyAuthBundleJson,
  createAuthBundle,
  renderAuthBundle,
  renderAuthExport,
} from "../src/lib/auth-bundle.js";
import { getConfigMode } from "../src/lib/env.js";
import { clearRuntimeAuth, setRuntimeMcpServing } from "../src/lib/runtime.js";
import { loadTokens, saveTokens, type StoredTokens } from "../src/lib/tokens.js";

const originalClientId = process.env.X_CLIENT_ID;
const originalClientSecret = process.env.X_CLIENT_SECRET;

function tokens(): StoredTokens {
  return {
    access_token: "access",
    refresh_token: "refresh",
    expires_at: 1_900_000_000,
    scope: "tweet.read users.read offline.access",
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
      tokens(),
    );

    applyAuthBundleJson(JSON.stringify(bundle), "read-write");

    expect(process.env.X_CLIENT_ID).toBe("client");
    expect(process.env.X_CLIENT_SECRET).toBe("secret");
    expect(getConfigMode()).toBe("read-write");
    expect(loadTokens()).toEqual(tokens());

    saveTokens({ ...tokens(), access_token: "new-access" });

    expect(loadTokens()?.access_token).toBe("new-access");
  });

  test("blocks local auth export while serving MCP", () => {
    setRuntimeMcpServing(true);

    expect(() => renderAuthExport("json")).toThrow(
      "Auth export is disabled while serving MCP.",
    );
  });
});
