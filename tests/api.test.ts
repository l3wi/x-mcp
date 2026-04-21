import { afterEach, describe, expect, test, vi } from "vitest";
import {
  _addCursorParams,
  _buildConversationContextSearchUrl,
  _getConversationId,
  createClient,
} from "../src/lib/api.js";
import { clearRuntimeAuth, setRuntimeTokens } from "../src/lib/runtime.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRuntimeAuth();
  vi.restoreAllMocks();
});

function setValidTokens() {
  setRuntimeTokens({
    access_token: "access",
    refresh_token: "refresh",
    expires_at: 1_900_000_000,
    scope: "tweet.read users.read offline.access tweet.write like.write bookmark.write",
  });
}

describe("getConversationId", () => {
  test("uses the tweet conversation_id when present", () => {
    expect(
      _getConversationId(
        {
          data: {
            id: "222",
            conversation_id: "111",
          },
        },
        "222",
      ),
    ).toBe("111");
  });

  test("falls back to the target tweet ID", () => {
    expect(
      _getConversationId(
        {
          data: {
            id: "222",
          },
        },
        "222",
      ),
    ).toBe("222");
  });
});

describe("addCursorParams", () => {
  test("adds clamped max_results and pagination_token", () => {
    const params = new URLSearchParams();

    _addCursorParams(
      params,
      { maxResults: 500, paginationToken: "cursor" },
      5,
      100,
    );

    expect(params.get("max_results")).toBe("100");
    expect(params.get("pagination_token")).toBe("cursor");
  });

  test("omits pagination_token when no cursor is provided", () => {
    const params = new URLSearchParams();

    _addCursorParams(params, { maxResults: 1 }, 5, 100);

    expect(params.get("max_results")).toBe("5");
    expect(params.has("pagination_token")).toBe(false);
  });
});

describe("buildConversationContextSearchUrl", () => {
  test("builds a recent-search URL with conversation_id query", () => {
    const url = new URL(_buildConversationContextSearchUrl("123", 10));

    expect(url.origin).toBe("https://api.x.com");
    expect(url.pathname).toBe("/2/tweets/search/recent");
    expect(url.searchParams.get("query")).toBe("conversation_id:123");
    expect(url.searchParams.get("max_results")).toBe("10");
    expect(url.searchParams.get("expansions")).toContain("author_id");
  });

  test("clamps max_results to the recent-search range", () => {
    const minUrl = new URL(_buildConversationContextSearchUrl("123", 1));
    const maxUrl = new URL(_buildConversationContextSearchUrl("123", 200));

    expect(minUrl.searchParams.get("max_results")).toBe("10");
    expect(maxUrl.searchParams.get("max_results")).toBe("100");
  });
});

describe("XApiClient request behavior", () => {
  test("tweet metrics requests public metrics by default", async () => {
    setValidTokens();
    const requests: string[] = [];
    globalThis.fetch = vi.fn(async (input: URL | RequestInfo) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ data: { id: "123" } }), { status: 200 });
    }) as typeof fetch;

    await createClient({ X_CLIENT_ID: "client" }).getTweetMetrics("123");

    const url = new URL(requests[0] as string);
    expect(url.searchParams.get("tweet.fields")).toBe("public_metrics");
  });

  test("encodes username path segments", async () => {
    setValidTokens();
    const requests: string[] = [];
    globalThis.fetch = vi.fn(async (input: URL | RequestInfo) => {
      requests.push(String(input));
      return new Response(JSON.stringify({ data: { id: "u1" } }), { status: 200 });
    }) as typeof fetch;

    await createClient({ X_CLIENT_ID: "client" }).getUser("user_name");

    expect(requests[0]).toContain("/users/by/username/user_name?");
  });

  test("rejects invalid poll options before fetch", async () => {
    setValidTokens();
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(
      createClient({ X_CLIENT_ID: "client" }).postTweet("poll", {
        pollOptions: ["Yes", ""],
      }),
    ).rejects.toThrow("Poll options");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("handles non-JSON error responses with HTTP status", async () => {
    setValidTokens();
    globalThis.fetch = vi.fn(async () =>
      new Response("upstream unavailable", { status: 503 }),
    ) as typeof fetch;

    await expect(
      createClient({ X_CLIENT_ID: "client" }).getTweet("123"),
    ).rejects.toThrow("API error (HTTP 503): upstream unavailable");
  });

  test("uses title-only X error messages", async () => {
    setValidTokens();
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ title: "Forbidden", status: 403 }] }), {
        status: 403,
      }),
    ) as typeof fetch;

    await expect(
      createClient({ X_CLIENT_ID: "client" }).getTweet("123"),
    ).rejects.toThrow("API error (HTTP 403): Forbidden: 403");
  });
});
