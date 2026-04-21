import { z } from "incur";
import { config } from "dotenv";
import { existsSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import { createInterface } from "readline/promises";
import { getRuntimeConfig } from "./runtime.js";
import { loadTokens } from "./tokens.js";
import { hasRequiredWriteScopes } from "./scopes.js";
import { readPrivateTextFile, writePrivateTextFile } from "./private-files.js";

export function loadDotenv() {
  loadConfigJson();
  const configPath = join(homedir(), ".x-cli", ".env");
  if (existsSync(configPath)) {
    readPrivateTextFile(configPath);
    config({ path: configPath });
  }
  const cwdEnvPath = join(process.cwd(), ".env");
  if (existsSync(cwdEnvPath)) {
    process.stderr.write(
      "Warning: loading cwd .env is deprecated for x-cli. Prefer ~/.x-cli/.env or ~/.x-cli/config.json.\n",
    );
    config({ path: cwdEnvPath });
  }
}

export interface ConfigJson {
  X_CLIENT_ID?: string;
  X_CLIENT_SECRET?: string;
  mode?: CliMode;
}

const CONFIG_PATH = join(homedir(), ".x-cli", "config.json");
const DEFAULT_MODE = "read-only";
const MODES = ["read-only", "read-write"] as const;

export type CliMode = (typeof MODES)[number];

function isCliMode(value: unknown): value is CliMode {
  return typeof value === "string" && MODES.includes(value as CliMode);
}

function cleanConfig(config: ConfigJson): ConfigJson {
  return {
    ...(config.X_CLIENT_ID?.trim()
      ? { X_CLIENT_ID: config.X_CLIENT_ID.trim() }
      : {}),
    ...(config.X_CLIENT_SECRET?.trim()
      ? { X_CLIENT_SECRET: config.X_CLIENT_SECRET.trim() }
      : {}),
    mode: isCliMode(config.mode) ? config.mode : DEFAULT_MODE,
  };
}

function applyConfigToProcessEnv(config: ConfigJson): void {
  if (config.X_CLIENT_ID && !process.env.X_CLIENT_ID) {
    process.env.X_CLIENT_ID = config.X_CLIENT_ID;
  }
  if (config.X_CLIENT_SECRET && !process.env.X_CLIENT_SECRET) {
    process.env.X_CLIENT_SECRET = config.X_CLIENT_SECRET;
  }
}

export function loadConfigJson(path: string = CONFIG_PATH): ConfigJson | null {
  if (!existsSync(path)) return null;
  try {
    const contents = readPrivateTextFile(path);
    if (!contents) return null;
    const parsed = JSON.parse(contents) as ConfigJson;
    const cleaned = cleanConfig(parsed);
    applyConfigToProcessEnv(cleaned);
    return cleaned;
  } catch {
    return null;
  }
}

export function saveConfigJson(
  config: ConfigJson,
  path: string = CONFIG_PATH,
): void {
  const cleaned = cleanConfig(config);
  writePrivateTextFile(path, JSON.stringify(cleaned, null, 2));
  applyConfigToProcessEnv(cleaned);
}

export function getConfigMode(path: string = CONFIG_PATH): CliMode {
  const runtimeMode = getRuntimeConfig()?.mode;
  if (isCliMode(runtimeMode)) return runtimeMode;
  return loadConfigJson(path)?.mode ?? DEFAULT_MODE;
}

export function setConfigMode(
  mode: CliMode,
  path: string = CONFIG_PATH,
): ConfigJson {
  const current = loadConfigJson(path) ?? {};
  const next = {
    ...current,
    mode,
  };
  saveConfigJson(next, path);
  return cleanConfig(next);
}

export function requireReadWriteMode(path: string = CONFIG_PATH): void {
  if (getConfigMode(path) !== "read-write") {
    throw new Error(
      "This command requires read-write mode. Run `x-cli config mode read-write` to enable write actions.",
    );
  }
  const tokens = loadTokens();
  if (tokens && hasRequiredWriteScopes(tokens.scope)) return;
  throw new Error(
    "This command requires OAuth tokens with write scopes. Run `x-cli auth login --read-write` first.",
  );
}

export const envSchema = z.object({
  X_CLIENT_ID: z.string().describe("OAuth 2.0 Client ID"),
  X_CLIENT_SECRET: z
    .string()
    .optional()
    .describe("OAuth 2.0 Client Secret (confidential clients)"),
});
export const optionalEnvSchema = envSchema.partial();

export type Env = z.infer<typeof envSchema>;

export function getEnvFromProcess(): Env | null {
  const parsed = envSchema.safeParse(process.env);
  return parsed.success ? parsed.data : null;
}

export async function resolveLoginEnv(): Promise<Env> {
  const existing = getEnvFromProcess();
  if (existing) return existing;

  const stdin = process.stdin as NodeJS.ReadStream;
  const stdout = process.stdout as NodeJS.WriteStream;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error(
      "Missing X OAuth credentials. Run `x-cli auth login` in an interactive terminal or create ~/.x-cli/config.json.",
    );
  }

  console.log("X OAuth app credentials are required before authorization.");
  console.log("You can find these in the X Developer Portal for your app.\n");

  const rl = createInterface({
    input: stdin,
    output: stdout,
  });

  try {
    const clientId = (
      await rl.question("X OAuth 2.0 Client ID: ")
    ).trim();
    if (!clientId) throw new Error("X_CLIENT_ID is required.");

    const clientSecret = (
      await rl.question(
        "X OAuth 2.0 Client Secret (optional; press Enter for public/native app): ",
      )
    ).trim();

    const env: Env = {
      X_CLIENT_ID: clientId,
      ...(clientSecret ? { X_CLIENT_SECRET: clientSecret } : {}),
    };
    saveConfigJson({
      ...env,
      mode: getConfigMode(),
    });
    console.log("Saved credentials to ~/.x-cli/config.json.\n");
    return env;
  } finally {
    rl.close();
  }
}
