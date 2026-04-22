import { existsSync, unlinkSync } from "fs";
import { homedir } from "os";
import { join } from "path";
import {
  clearRuntimeTokens,
  getRuntimeTokens,
  hasRuntimeTokens,
  setRuntimeTokens,
} from "./runtime.js";
import { readPrivateTextFile, writePrivateTextFile } from "./private-files.js";

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
    const contents = readPrivateTextFile(TOKEN_PATH);
    if (!contents) return null;
    return validateStoredTokens(JSON.parse(contents));
  } catch {
    return null;
  }
}

export function saveTokens(tokens: StoredTokens): void {
  if (hasRuntimeTokens()) {
    setRuntimeTokens(tokens);
    return;
  }
  writePrivateTextFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
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

function validateStoredTokens(value: unknown): StoredTokens | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const accessToken = normalizeTokenString(raw.access_token);
  if (!accessToken) return null;
  const refreshToken = normalizeTokenString(raw.refresh_token);
  if (!refreshToken) return null;
  if (typeof raw.expires_at !== "number" || !Number.isFinite(raw.expires_at)) {
    return null;
  }
  const scope = normalizeTokenString(raw.scope);
  if (scope === null) return null;
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_at: raw.expires_at,
    scope,
  };
}

function normalizeTokenString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
