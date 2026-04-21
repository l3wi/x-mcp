import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, chmodSync } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { clearRuntimeTokens, getRuntimeTokens, hasRuntimeTokens, setRuntimeTokens } from "./runtime.js";

export interface StoredTokens {
  access_token: string;
  refresh_token: string;
  expires_at: number; // Unix timestamp (seconds)
  scope: string;
}

const TOKEN_PATH = join(homedir(), ".x-cli", "tokens.json");

export function loadTokens(): StoredTokens | null {
  const runtimeTokens = getRuntimeTokens();
  if (runtimeTokens) return runtimeTokens;
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  if (hasRuntimeTokens()) {
    setRuntimeTokens(tokens);
    return;
  }
  const dir = dirname(TOKEN_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  chmodSync(TOKEN_PATH, 0o600);
}

export function deleteTokens(): void {
  if (hasRuntimeTokens()) {
    clearRuntimeTokens();
    return;
  }
  if (existsSync(TOKEN_PATH)) unlinkSync(TOKEN_PATH);
}

export function isExpired(tokens: StoredTokens): boolean {
  return Date.now() / 1000 >= tokens.expires_at - 60; // 60s buffer
}
