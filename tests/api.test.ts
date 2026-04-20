import { describe, expect, test } from "vitest";
import {
  _addCursorParams,
  _buildConversationContextSearchUrl,
  _getConversationId,
} from "../src/lib/api.js";

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
