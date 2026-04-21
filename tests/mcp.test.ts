import { afterEach, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { spawn } from "node:child_process";

const initParams = {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "x-cli-test", version: "1.0.0" },
};

let tempHomes: string[] = [];

afterEach(() => {
  for (const home of tempHomes) {
    rmSync(home, { recursive: true, force: true });
  }
  tempHomes = [];
});

describe("MCP command surface", () => {
  test("read-only mode hides write and mutating admin tools", async () => {
    const names = await listMcpTools(createHome({ mode: "read-only" }));

    expect(names).toContain("auth_status");
    expect(names).toContain("config_show");
    expect(names).toContain("tweet_get");
    expect(names).not.toContain("auth_login");
    expect(names).not.toContain("auth_logout");
    expect(names).not.toContain("auth_export");
    expect(names).not.toContain("config_mode");
    expect(names).not.toContain("tweet_post");
    expect(names).not.toContain("tweet_delete");
    expect(names).not.toContain("tweet_reply");
    expect(names).not.toContain("tweet_quote");
    expect(names).not.toContain("me_bookmark");
    expect(names).not.toContain("me_unbookmark");
    expect(names).not.toContain("like");
    expect(names).not.toContain("retweet");
  });

  test("read-write mode includes write X tools but not mutating admin tools", async () => {
    const names = await listMcpTools(createHome({ mode: "read-write" }));

    expect(names).toContain("tweet_post");
    expect(names).toContain("tweet_delete");
    expect(names).toContain("me_bookmark");
    expect(names).toContain("like");
    expect(names).toContain("retweet");
    expect(names).not.toContain("auth_login");
    expect(names).not.toContain("auth_logout");
    expect(names).not.toContain("auth_export");
    expect(names).not.toContain("config_mode");
  });
});

function createHome(options: { mode: "read-only" | "read-write" }): string {
  const home = mkdtempSync(join(process.cwd(), ".tmp-mcp-test-"));
  tempHomes.push(home);
  const configDir = join(home, ".x-cli");
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  writeFileSync(
    join(configDir, "config.json"),
    JSON.stringify({ X_CLIENT_ID: "client", mode: options.mode }),
    { mode: 0o600 },
  );
  writeFileSync(
    join(configDir, "tokens.json"),
    JSON.stringify({
      access_token: "access",
      refresh_token: "refresh",
      expires_at: 1_900_000_000,
      scope: "tweet.read users.read offline.access tweet.write like.write bookmark.write",
    }),
    { mode: 0o600 },
  );
  return home;
}

async function listMcpTools(home: string): Promise<string[]> {
  const responses = await mcpSession(home, [
    { id: 1, method: "initialize", params: initParams },
    { id: 2, method: "tools/list", params: {} },
  ]);
  const listResponse = responses.find((response) => response.id === 2);
  expect(listResponse).toBeDefined();
  return (listResponse as { result: { tools: Array<{ name: string }> } })
    .result
    .tools
    .map((tool) => tool.name)
    .sort();
}

async function mcpSession(
  home: string,
  messages: { method: string; params?: unknown; id?: number }[],
): Promise<Array<Record<string, any>>> {
  const proc = spawn(process.execPath, [
    "--import",
    "tsx",
    "src/index.ts",
    "--mcp",
  ], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOME: home,
      X_CLIENT_ID: "",
      X_CLIENT_SECRET: "",
    },
  });

  let stdout = "";
  let stderr = "";
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  proc.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  for (const message of messages) {
    proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
  }
  proc.stdin.end();

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", resolve);
  });
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return stdout
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, any>);
}
