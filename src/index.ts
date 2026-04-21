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
import { hasRequiredWriteScopes } from "./lib/scopes.js";
import { loadTokens } from "./lib/tokens.js";
import {
  formatHelpForMode,
  prepareHelpArgv,
  stripGlobalOptions,
} from "./lib/help.js";
import { setRuntimeMcpServing, setRuntimeMode } from "./lib/runtime.js";
import { createAuthCommand } from "./commands/auth.js";
import { createTweetCommand } from "./commands/tweet.js";
import { user } from "./commands/user.js";
import { createMeCommand } from "./commands/me.js";
import { createConfigCommand } from "./commands/config.js";
import { likeCommand } from "./commands/like.js";
import { retweetCommand } from "./commands/retweet.js";

async function main(): Promise<void> {
  // Load .env files before CLI parses env schemas
  loadDotenv();

  const cliName = resolveCliName(process.argv[1], process.env._);
  const prepared = prepareServeArgv(
    process.argv[1],
    process.argv.slice(2),
    process.env._,
  );
  const help = prepareHelpArgv(prepared.argv);
  const servingMcp = prepared.argv.includes("--mcp") && !help.isHelp;
  const authJson = prepared.authJson ?? process.env.X_CLI_AUTH_JSON;
  if (prepared.authJson) {
    process.stderr.write(
      "Warning: --auth-json is deprecated because process arguments can leak. Prefer X_CLI_AUTH_JSON or a client-managed secret store.\n",
    );
  }
  if (authJson) {
    applyAuthBundleJson(authJson, prepared.mcpMode);
  } else if (prepared.mcpMode) {
    setRuntimeMode(prepared.mcpMode);
  }

  const exportFormat = prepared.exportFormat ?? authExportFormat(prepared.argv);
  if (exportFormat && !help.isHelp) {
    process.stdout.write(`${renderAuthExport(exportFormat)}\n`);
    return;
  }

  setRuntimeMcpServing(servingMcp);
  const cli = Cli.create(cliName, {
    version: "0.2.1",
    description: "MCP server and CLI for X/Twitter API v2",
    sync: {
      depth: 1,
      include: ["skills/*"],
      suggestions: [
        "Use x-cli to check my X auth status and explain what permissions are available.",
        "Use x-cli to search recent tweets about a topic.",
        "Use x-cli to fetch a user timeline and summarize it.",
      ],
    },
  });
  const includeWrite = !servingMcp || canExposeMcpWriteTools();

  // Mount sub-CLI groups
  cli.command(
    createAuthCommand({
      includeLogin: !servingMcp,
      includeLogout: !servingMcp,
      includeExport: !servingMcp,
      includeImport: !servingMcp,
    }),
  );
  cli.command(createTweetCommand({ includeWrite }));
  cli.command(user);
  cli.command(createMeCommand({ includeWrite }));
  cli.command(createConfigCommand({ includeMode: !servingMcp }));

  // Top-level commands
  if (includeWrite) {
    cli.command("like", likeCommand);
    cli.command("retweet", retweetCommand);
  }

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

  await cli.serve(help.isHelp ? stripMcpFlag(help.argv) : help.argv);
}

function authExportFormat(argv: string[]): AuthExportFormat | undefined {
  if (argv[0] !== "auth" || argv[1] !== "export") return undefined;
  if (hasHelp(argv) || hasIntrospectionFlag(argv)) return undefined;
  const value = argv[2] ?? "json";
  if (isAuthExportFormat(value)) return value;
  throw new Error("auth export format must be json, codex, or claude.");
}

function hasHelp(argv: string[]): boolean {
  return argv.some((arg) => arg === "--help" || arg === "-h");
}

function hasIntrospectionFlag(argv: string[]): boolean {
  return argv.some((arg) =>
    arg === "--schema" || arg === "--llms" || arg === "--llms-full",
  );
}

function stripMcpFlag(argv: string[]): string[] {
  return argv.filter((arg) => arg !== "--mcp");
}

function canExposeMcpWriteTools(): boolean {
  if (getConfigMode() !== "read-write") return false;
  const tokens = loadTokens();
  return !!tokens && hasRequiredWriteScopes(tokens.scope);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
