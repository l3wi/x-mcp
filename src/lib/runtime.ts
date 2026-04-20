import type { CliMode, ConfigJson } from "./env.js";
import type { StoredTokens } from "./tokens.js";

let runtimeConfig: ConfigJson | null = null;
let runtimeTokens: StoredTokens | null = null;
let runtimeMcpServing = false;

export function setRuntimeConfig(config: ConfigJson): void {
  runtimeConfig = config;
}

export function getRuntimeConfig(): ConfigJson | null {
  return runtimeConfig;
}

export function setRuntimeTokens(tokens: StoredTokens): void {
  runtimeTokens = tokens;
}

export function getRuntimeTokens(): StoredTokens | null {
  return runtimeTokens;
}

export function hasRuntimeTokens(): boolean {
  return runtimeTokens !== null;
}

export function clearRuntimeTokens(): void {
  runtimeTokens = null;
}

export function setRuntimeMode(mode: CliMode): void {
  runtimeConfig = {
    ...(runtimeConfig ?? {}),
    mode,
  };
}

export function clearRuntimeAuth(): void {
  runtimeConfig = null;
  runtimeTokens = null;
  runtimeMcpServing = false;
}

export function setRuntimeMcpServing(serving: boolean): void {
  runtimeMcpServing = serving;
}

export function isRuntimeMcpServing(): boolean {
  return runtimeMcpServing;
}
