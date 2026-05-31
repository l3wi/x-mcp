/**
 * Optional GetXAPI read backend for x-mcp.
 */

const DEFAULT_BASE_URL = "https://api.getxapi.com";

type Env = Record<string, string | undefined>;

export const configuredGetXAPIApiKey = (env: Env = process.env): string =>
  env.GETXAPI_API_KEY || env.GETXAPI_KEY || "";

export const configuredGetXAPIBaseUrl = (env: Env = process.env): string =>
  (env.GETXAPI_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");

export const hasGetXAPIBackend = (env: Env = process.env): boolean =>
  Boolean(configuredGetXAPIApiKey(env));

export const buildGetXAPIUrl = (
  path: string,
  params: Record<string, string | number | undefined>,
  env: Env = process.env,
): string => {
  const baseUrl = configuredGetXAPIBaseUrl(env);
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    cleaned[key] = String(value);
  }
  const query = new URLSearchParams(cleaned).toString();
  const target = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  return query ? `${target}?${query}` : target;
};

export const getXAPIHeaders = (env: Env = process.env): Record<string, string> => ({
  accept: "application/json",
  authorization: `Bearer ${configuredGetXAPIApiKey(env)}`,
});

export const searchGetXAPITweets = async (
  query: string,
  limit = 25,
  env: Env = process.env,
): Promise<unknown> => {
  if (!hasGetXAPIBackend(env)) {
    throw new Error("Set GETXAPI_API_KEY to use the GetXAPI backend");
  }
  const response = await fetch(
    buildGetXAPIUrl("/twitter/tweet/advanced_search", { q: query, limit }, env),
    { headers: getXAPIHeaders(env) },
  );
  if (!response.ok) {
    throw new Error(`GetXAPI request failed: ${response.status}`);
  }
  return response.json();
};

export const extractGetXAPITweets = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["tweets", "results", "items"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  const data = record.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") return extractGetXAPITweets(data);
  return [];
};
