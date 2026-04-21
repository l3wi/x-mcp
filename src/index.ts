#!/usr/bin/env node
import { Cli } from "incur";
import { prepareServeArgv, resolveCliName } from "./lib/argv.js";
import {
  applyAuthBundleJson,
  isAuthExportFormat,
  renderAuthExport,
  type AuthExportFormat,
} from "./lib/auth-bundle.js";
import { getConfigMode, loadDotenv } from "./lib/env.js";
import {
  formatHelpForMode,
  prepareHelpArgv,
  stripGlobalOptions,
} from "./lib/help.js";
import { setRuntimeMcpServing, setRuntimeMode } from "./lib/runtime.js";
import { auth } from "./commands/auth.js";
import { tweet } from "./commands/tweet.js";
import { user } from "./commands/user.js";
import { me } from "./commands/me.js";
import { configCommand } from "./commands/config.js";
import { likeCommand } from "./commands/like.js";
import { retweetCommand } from "./commands/retweet.js";

async function main(): Promise<void> {
  // Load .env files before CLI parses env schemas
  loadDotenv();

  const cliName = resolveCliName(process.argv[1], process.env._);
  const prepared = prepareServeArgv(process.argv[1], process.argv.slice(2), process.env._);
  setRuntimeMcpServing(prepared.argv.includes("--mcp"));
  const authJson = prepared.authJson ?? process.env.X_CLI_AUTH_JSON;
  if (authJson) {
    applyAuthBundleJson(authJson, prepared.mcpMode);
  } else if (prepared.mcpMode) {
    setRuntimeMode(prepared.mcpMode);
  }

  const exportFormat = prepared.exportFormat ?? authExportFormat(prepared.argv);
  if (exportFormat && !hasHelp(prepared.argv)) {
    process.stdout.write(`${renderAuthExport(exportFormat)}\n`);
    return;
  }

  const cli = Cli.create(cliName, {
    version: "0.2.0",
    description: "MCP server and CLI for X/Twitter API v2",
  });

  // Mount sub-CLI groups
  cli.command(auth);
  cli.command(tweet);
  cli.command(user);
  cli.command(me);
  cli.command(configCommand);

  // Top-level commands
  cli.command("like", likeCommand);
  cli.command("retweet", retweetCommand);

  const help = prepareHelpArgv(prepared.argv);

  if (help.isHelp) {
    const originalWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
      const chunkText = typeof chunk === "string"
        ? chunk
        : new TextDecoder().decode(chunk);
      const rawText = help.hideGlobalOptions
        ? stripGlobalOptions(chunkText)
        : chunkText;
      const text = formatHelpForMode(rawText, {
        argv: help.argv,
        mode: getConfigMode(),
      });
      return originalWrite(text, ...args as [BufferEncoding, () => void]);
    }) as typeof process.stdout.write;
  }

  await cli.serve(help.argv);
}

function authExportFormat(argv: string[]): AuthExportFormat | undefined {
  if (argv[0] !== "auth" || argv[1] !== "export") return undefined;
  if (hasHelp(argv)) return undefined;
  const value = argv[2] ?? "json";
  if (isAuthExportFormat(value)) return value;
  throw new Error("auth export format must be json, codex, or claude.");
}

function hasHelp(argv: string[]): boolean {
  return argv.some((arg) => arg === "--help" || arg === "-h");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
