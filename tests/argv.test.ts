import { describe, expect, test } from "vitest";
import { prepareServeArgv, resolveCliName, resolveServeArgv } from "../src/lib/argv.js";

describe("resolveCliName", () => {
  test("uses x-cli for x-cli invocation help", () => {
    expect(resolveCliName("/usr/local/bin/x-cli")).toBe("x-cli");
  });

  test("defaults to x-cli for direct source execution", () => {
    expect(resolveCliName("/repo/src/index.ts")).toBe("x-cli");
  });
});

describe("resolveServeArgv", () => {
  test("defaults bare x-cli invocation to MCP stdio mode", () => {
    expect(resolveServeArgv("/usr/local/bin/x-cli", [])).toEqual(["--mcp"]);
  });

  test("uses shell command path when defaulting bare x-cli to MCP stdio mode", () => {
    expect(resolveServeArgv("/repo/dist/index.js", [], "/usr/local/bin/x-cli")).toEqual(["--mcp"]);
  });

  test("does not override explicit x-cli arguments", () => {
    expect(resolveServeArgv("/usr/local/bin/x-cli", ["--help"])).toEqual([
      "--help",
    ]);
  });

});

describe("prepareServeArgv", () => {
  test("strips auth json and preserves mcp serve argv", () => {
    expect(
      prepareServeArgv("/usr/local/bin/x-cli", [
        "--mcp",
        "--auth-json",
        "{\"type\":\"x-cli-auth\"}",
        "--mcp-mode",
        "read-write",
      ]),
    ).toEqual({
      argv: ["--mcp"],
      authJson: "{\"type\":\"x-cli-auth\"}",
      mcpMode: "read-write",
    });
  });

  test("bare x-cli with auth json still defaults to mcp mode", () => {
    expect(
      prepareServeArgv("/repo/src/index.ts", [
        "--auth-json",
        "{}",
      ], "/usr/local/bin/x-cli"),
    ).toEqual({
      argv: ["--mcp"],
      authJson: "{}",
    });
  });

  test("extracts mcp export format", () => {
    expect(
      prepareServeArgv("/usr/local/bin/x-cli", [
        "--mcp",
        "--export",
        "codex",
      ]),
    ).toEqual({
      argv: ["--mcp"],
      exportFormat: "codex",
    });
  });

  test("normalizes auth export --format to positional format", () => {
    expect(
      prepareServeArgv("/usr/local/bin/x-cli", [
        "auth",
        "export",
        "--format",
        "claude",
      ]),
    ).toEqual({
      argv: ["auth", "export", "claude"],
    });
  });
});
