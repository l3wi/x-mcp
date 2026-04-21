import { describe, expect, test } from "vitest";
import {
  prepareServeArgv,
  resolveCliName,
  resolveServeArgv,
} from "../src/lib/argv.js";

describe("resolveCliName", () => {
  test("uses x-cli for x-cli invocation help", () => {
    expect(resolveCliName("/usr/local/bin/x-cli")).toBe("x-cli");
  });

  test("uses x-mcp for x-mcp invocation help", () => {
    expect(resolveCliName("/usr/local/bin/x-mcp")).toBe("x-mcp");
  });

  test("defaults to x-cli for direct source execution", () => {
    expect(resolveCliName("/repo/src/index.ts")).toBe("x-cli");
  });
});

describe("resolveServeArgv", () => {
  test("defaults bare x-cli invocation to help", () => {
    expect(resolveServeArgv("/usr/local/bin/x-cli", [])).toEqual(["--help"]);
  });

  test("defaults bare x-mcp invocation to MCP stdio mode", () => {
    expect(resolveServeArgv("/usr/local/bin/x-mcp", [])).toEqual(["--mcp"]);
  });

  test("uses shell command path when defaulting bare x-mcp to MCP stdio mode", () => {
    expect(resolveServeArgv("/repo/dist/index.js", [], "/usr/local/bin/x-mcp")).toEqual(["--mcp"]);
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

  test("bare x-mcp with auth json still defaults to mcp mode", () => {
    expect(
      prepareServeArgv("/repo/src/index.ts", [
        "--auth-json",
        "{}",
      ], "/usr/local/bin/x-mcp"),
    ).toEqual({
      argv: ["--mcp"],
      authJson: "{}",
    });
  });

  test("bare x-cli with auth json shows help instead of mcp mode", () => {
    expect(
      prepareServeArgv("/repo/src/index.ts", [
        "--auth-json",
        "{}",
      ], "/usr/local/bin/x-cli"),
    ).toEqual({
      argv: ["--help"],
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

  test("does not treat --export on another command as auth export", () => {
    expect(
      prepareServeArgv("/usr/local/bin/x-cli", [
        "tweet",
        "search",
        "cats",
        "--export",
        "codex",
      ]),
    ).toEqual({
      argv: ["tweet", "search", "cats", "--export", "codex"],
    });
  });

  test("preserves literal args after -- separator", () => {
    expect(
      prepareServeArgv("/usr/local/bin/x-cli", [
        "tweet",
        "search",
        "--",
        "--export",
      ]),
    ).toEqual({
      argv: ["tweet", "search", "--", "--export"],
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
