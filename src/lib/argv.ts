import { basename } from "path";

type BinName = "x-cli";
type ExportFormat = "json" | "codex" | "claude";

export interface PreparedArgv {
  argv: string[];
  authJson?: string;
  exportFormat?: ExportFormat;
  mcpMode?: "read-only" | "read-write";
}

function resolveBinName(
  invokedPath: string | undefined,
  commandPath: string | undefined,
): BinName | null {
  for (const path of [commandPath, invokedPath]) {
    const name = basename(path ?? "");
    if (name === "x-cli") return name;
  }
  return null;
}

export function resolveCliName(
  invokedPath: string | undefined,
  commandPath?: string,
): BinName {
  return resolveBinName(invokedPath, commandPath) ?? "x-cli";
}

export function resolveServeArgv(
  invokedPath: string | undefined,
  argv: string[],
  commandPath?: string,
): string[] {
  if (resolveBinName(invokedPath, commandPath) === "x-cli" && argv.length === 0) {
    return ["--mcp"];
  }
  return argv;
}

export function prepareServeArgv(
  invokedPath: string | undefined,
  argv: string[],
  commandPath?: string,
): PreparedArgv {
  const result = extractBootstrapFlags(argv);
  const normalized = normalizeAuthExportFormatArgv(result.argv);
  const serveArgv = resolveServeArgv(invokedPath, normalized, commandPath);
  return {
    argv: serveArgv,
    ...(result.authJson ? { authJson: result.authJson } : {}),
    ...(result.exportFormat ? { exportFormat: result.exportFormat } : {}),
    ...(result.mcpMode ? { mcpMode: result.mcpMode } : {}),
  };
}

function extractBootstrapFlags(argv: string[]): PreparedArgv {
  const rest: string[] = [];
  const result: PreparedArgv = { argv: rest };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--auth-json") {
      result.authJson = requireValue(argv[++i], "--auth-json");
    } else if (token.startsWith("--auth-json=")) {
      result.authJson = requireValue(token.slice("--auth-json=".length), "--auth-json");
    } else if (token === "--mcp-mode") {
      result.mcpMode = parseMode(requireValue(argv[++i], "--mcp-mode"));
    } else if (token.startsWith("--mcp-mode=")) {
      result.mcpMode = parseMode(token.slice("--mcp-mode=".length));
    } else if (token === "--export") {
      result.exportFormat = parseExportFormat(argv[++i] ?? "json");
    } else if (token.startsWith("--export=")) {
      result.exportFormat = parseExportFormat(token.slice("--export=".length) || "json");
    } else {
      rest.push(token);
    }
  }

  return result;
}

function normalizeAuthExportFormatArgv(argv: string[]): string[] {
  if (argv[0] !== "auth" || argv[1] !== "export") return argv;
  const normalized: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (token === "--format") {
      normalized.push(requireValue(argv[++i], "--format"));
    } else if (token.startsWith("--format=")) {
      normalized.push(requireValue(token.slice("--format=".length), "--format"));
    } else {
      normalized.push(token);
    }
  }

  return normalized;
}

function parseMode(value: string): "read-only" | "read-write" {
  if (value === "read-only" || value === "read-write") return value;
  throw new Error("--mcp-mode must be read-only or read-write.");
}

function parseExportFormat(value: string): ExportFormat {
  if (value === "json" || value === "codex" || value === "claude") return value;
  throw new Error("--export must be json, codex, or claude.");
}

function requireValue(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing value for ${flag}.`);
  return value;
}
