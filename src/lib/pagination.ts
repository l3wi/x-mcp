export interface CursorPage {
  data?: unknown;
  includes?: unknown;
  meta?: unknown;
}

export interface CursorPageRequest {
  maxResults: number;
  paginationToken?: string;
}

export interface CursorPaginationOptions {
  limit: number;
  pageSize: number;
  offset?: number;
  cursor?: string;
}

export interface PaginatedResult {
  data: unknown[];
  includes?: Record<string, unknown>;
  pagination: {
    limit: number;
    page_size: number;
    offset: number;
    returned: number;
    next_cursor?: string;
  };
}

export async function paginateCursor(
  options: CursorPaginationOptions,
  fetchPage: (request: CursorPageRequest) => Promise<CursorPage>,
): Promise<PaginatedResult> {
  const limit = Math.max(1, Math.floor(options.limit));
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  let remainingOffset = Math.max(0, Math.floor(options.offset ?? 0));
  let nextCursor = options.cursor;
  const data: unknown[] = [];
  const includeBuckets = new Map<string, unknown[]>();
  let safeNextCursor: string | undefined;

  while (data.length < limit) {
    const requestSize = Math.max(
      1,
      Math.min(pageSize, remainingOffset + (limit - data.length)),
    );
    const page = await fetchPage({
      maxResults: requestSize,
      paginationToken: nextCursor,
    });
    mergeIncludes(includeBuckets, page.includes);

    const pageData = Array.isArray(page.data) ? page.data : [];
    const offsetFromPage = Math.min(remainingOffset, pageData.length);
    remainingOffset -= offsetFromPage;
    const available = pageData.slice(offsetFromPage);
    const consumeCount = Math.min(available.length, limit - data.length);
    data.push(...available.slice(0, consumeCount));

    const pageNextCursor = getNextCursor(page.meta);
    safeNextCursor = consumeCount === available.length ? pageNextCursor : undefined;
    if (!pageNextCursor || pageData.length === 0 || data.length >= limit) break;
    nextCursor = pageNextCursor;
  }

  return {
    data,
    ...buildIncludes(includeBuckets),
    pagination: {
      limit,
      page_size: pageSize,
      offset: Math.max(0, Math.floor(options.offset ?? 0)),
      returned: data.length,
      ...(safeNextCursor ? { next_cursor: safeNextCursor } : {}),
    },
  };
}

export function clampPageSize(pageSize: number, min: number, max: number): number {
  return Math.max(min, Math.min(Math.floor(pageSize), max));
}

function getNextCursor(meta: unknown): string | undefined {
  if (!meta || typeof meta !== "object") return undefined;
  const token = (meta as { next_token?: unknown }).next_token;
  return typeof token === "string" && token.length > 0 ? token : undefined;
}

function mergeIncludes(
  buckets: Map<string, unknown[]>,
  includes: unknown,
): void {
  if (!includes || typeof includes !== "object") return;

  for (const [key, value] of Object.entries(includes)) {
    if (!Array.isArray(value)) continue;
    const bucket = buckets.get(key) ?? [];
    const seen = new Set(bucket.map(stableIncludeKey));
    for (const item of value) {
      const itemKey = stableIncludeKey(item);
      if (seen.has(itemKey)) continue;
      seen.add(itemKey);
      bucket.push(item);
    }
    buckets.set(key, bucket);
  }
}

function buildIncludes(
  buckets: Map<string, unknown[]>,
): { includes?: Record<string, unknown> } {
  if (buckets.size === 0) return {};
  return {
    includes: Object.fromEntries(buckets.entries()),
  };
}

function stableIncludeKey(value: unknown): string {
  if (value && typeof value === "object") {
    const keyed = value as { id?: unknown; media_key?: unknown };
    if (typeof keyed.id === "string") return `id:${keyed.id}`;
    if (typeof keyed.media_key === "string") return `media_key:${keyed.media_key}`;
  }
  return JSON.stringify(value);
}
