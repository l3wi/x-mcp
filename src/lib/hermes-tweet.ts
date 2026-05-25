import type { ReadEnv } from "./env.js";
import type { CursorPage, CursorPageRequest } from "./pagination.js";

const DEFAULT_BASE_URL = "https://xquik.com";
const SEARCH_PATH = "/api/v1/x/tweets/search";

export interface HermesTweetConfig {
  apiKey: string;
  baseUrl: string;
}

type JsonRecord = Record<string, unknown>;

export function getHermesTweetConfig(env: ReadEnv): HermesTweetConfig | null {
  const apiKey = (env.HERMES_TWEET_API_KEY ?? env.XQUIK_API_KEY ?? "").trim();
  if (!apiKey) return null;

  const backend = (env.X_CLI_READ_BACKEND ?? "").trim().toLowerCase();
  const explicitHermesBackend = backend === "hermes-tweet" || backend === "xquik";
  if (env.X_CLIENT_ID && !explicitHermesBackend) return null;

  return {
    apiKey,
    baseUrl: (env.XQUIK_BASE_URL ?? DEFAULT_BASE_URL).trim() || DEFAULT_BASE_URL,
  };
}

export async function hermesGetTweet(
  config: HermesTweetConfig,
  tweetId: string,
): Promise<Record<string, unknown>> {
  return normalizeEnvelope(
    await requestJson(config, `/api/v1/x/tweets/${encodeURIComponent(tweetId)}`),
    "tweet",
  );
}

export async function hermesSearchTweets(
  config: HermesTweetConfig,
  query: string,
  options: CursorPageRequest = { maxResults: 10 },
): Promise<CursorPage> {
  return normalizePage(
    await requestJson(config, SEARCH_PATH, {
      q: query,
      limit: String(options.maxResults),
      ...(options.paginationToken ? { cursor: options.paginationToken } : {}),
    }),
  );
}

export async function hermesGetTweetThread(
  config: HermesTweetConfig,
  tweetId: string,
): Promise<Record<string, unknown>> {
  return normalizeEnvelope(
    await requestJson(config, `/api/v1/x/tweets/${encodeURIComponent(tweetId)}/thread`),
    "thread",
  );
}

export async function hermesGetTweetMetrics(
  config: HermesTweetConfig,
  tweetId: string,
): Promise<Record<string, unknown>> {
  return normalizeEnvelope(
    await requestJson(config, `/api/v1/x/tweets/${encodeURIComponent(tweetId)}`),
    "tweet",
  );
}

export async function hermesGetUser(
  config: HermesTweetConfig,
  usernameOrId: string,
): Promise<Record<string, unknown>> {
  return normalizeEnvelope(
    await requestJson(config, `/api/v1/x/users/${encodeURIComponent(usernameOrId)}`),
    "user",
  );
}

export async function hermesGetUserTweets(
  config: HermesTweetConfig,
  usernameOrId: string,
  options: CursorPageRequest = { maxResults: 10 },
): Promise<CursorPage> {
  return normalizePage(
    await requestJson(config, `/api/v1/x/users/${encodeURIComponent(usernameOrId)}/tweets`, {
      limit: String(options.maxResults),
      ...(options.paginationToken ? { cursor: options.paginationToken } : {}),
    }),
  );
}

export async function hermesGetFollowers(
  config: HermesTweetConfig,
  usernameOrId: string,
  options: CursorPageRequest = { maxResults: 100 },
): Promise<CursorPage> {
  return normalizePage(
    await requestJson(config, `/api/v1/x/users/${encodeURIComponent(usernameOrId)}/followers`, {
      pageSize: String(options.maxResults),
      ...(options.paginationToken ? { cursor: options.paginationToken } : {}),
    }),
  );
}

export async function hermesGetFollowing(
  config: HermesTweetConfig,
  usernameOrId: string,
  options: CursorPageRequest = { maxResults: 100 },
): Promise<CursorPage> {
  return normalizePage(
    await requestJson(config, `/api/v1/x/users/${encodeURIComponent(usernameOrId)}/following`, {
      pageSize: String(options.maxResults),
      ...(options.paginationToken ? { cursor: options.paginationToken } : {}),
    }),
  );
}

async function requestJson(
  config: HermesTweetConfig,
  path: string,
  query: Record<string, string> = {},
): Promise<unknown> {
  const url = new URL(path, withTrailingSlash(config.baseUrl));
  for (const [key, value] of Object.entries(query)) {
    if (value) url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    headers: buildHeaders(config.apiKey),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const data = parseJson(text);
  if (!response.ok) {
    throw new Error(`Hermes Tweet backend error (HTTP ${response.status}): ${errorMessage(data, text)}`);
  }
  return data;
}

function buildHeaders(apiKey: string): Record<string, string> {
  if (apiKey.toLowerCase().startsWith("bearer ")) {
    return {
      Accept: "application/json",
      Authorization: apiKey,
    };
  }
  return {
    Accept: "application/json",
    "x-api-key": apiKey,
  };
}

function withTrailingSlash(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/`;
}

function parseJson(text: string): unknown {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

function normalizeEnvelope(payload: unknown, key: string): Record<string, unknown> {
  if (!isRecord(payload)) return { data: payload ?? {} };
  if (isRecord(payload.data)) return payload;

  const nested = payload[key];
  if (isRecord(nested)) {
    return {
      ...payload,
      data: nested,
    };
  }

  return {
    ...payload,
    data: payload,
  };
}

function normalizePage(payload: unknown): CursorPage {
  const data = extractArray(payload, ["data", "tweets", "items", "results", "posts", "users", "followers", "following"]);
  const root = isRecord(payload) ? payload : {};
  const meta = isRecord(root.meta) ? root.meta : {};
  const nextCursor = firstString([root, meta], ["next_token", "nextToken", "next_cursor", "nextCursor", "cursor", "next"]);

  return {
    data,
    ...(isRecord(root.includes) ? { includes: root.includes } : {}),
    meta: {
      ...meta,
      ...(nextCursor ? { next_token: nextCursor } : {}),
    },
  };
}

function extractArray(payload: unknown, keys: string[]): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return [];

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  for (const key of ["data", "result", "response"]) {
    const value = payload[key];
    if (isRecord(value)) {
      const nested = extractArray(value, keys);
      if (nested.length) return nested;
    }
  }

  return [];
}

function firstString(records: JsonRecord[], keys: string[]): string {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

function errorMessage(data: unknown, text: string): string {
  if (isRecord(data)) {
    if (typeof data.error === "string") return data.error;
    if (typeof data.message === "string") return data.message;
    if (typeof data.detail === "string") return data.detail;
  }
  return text ? text.slice(0, 500) : "Unknown error";
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
