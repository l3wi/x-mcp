import { describe, expect, test } from "vitest";
import { spawn } from "node:child_process";

async function cliHelp(args: string[]): Promise<string> {
  const proc = spawn(process.execPath, [
    "--import",
    "tsx",
    "src/index.ts",
    ...args,
    "--help",
  ], {
    cwd: process.cwd(),
    env: process.env,
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

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("exit", resolve);
  });
  expect(stderr).toBe("");
  expect(exitCode).toBe(0);
  return stdout;
}

describe("paginated command help", () => {
  for (const args of [
    ["me", "bookmarks"],
    ["me", "mentions"],
    ["tweet", "search"],
    ["user", "timeline"],
    ["user", "followers"],
    ["user", "following"],
  ]) {
    test(`${args.join(" ")} uses pagination options instead of --max`, async () => {
      const help = await cliHelp(args);

      expect(help).toContain("--limit");
      expect(help).toContain("--page-size");
      expect(help).toContain("--cursor");
      expect(help).toContain("--offset");
      expect(help).not.toContain("--max");
    });
  }
});
