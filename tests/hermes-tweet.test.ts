import { afterEach, describe, expect, test, vi } from "vitest";
import { createClient } from "../src/lib/api.js";
import { getHermesTweetConfig } from "../src/lib/hermes-tweet.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Hermes Tweet read backend", () => {
  test("uses Hermes Tweet search when no OAuth client is configured", async () => {
    const requests: Array<{ url: string; headers: Headers }> = [];
    globalThis.fetch = vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({
        url: String(input),
        headers: new Headers(init?.headers),
      });
      return new Response(
        JSON.stringify({
          tweets: [{ id: "1", text: "Hermes Tweet powers X research." }],
          next_cursor: "next",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const result = await createClient({ HERMES_TWEET_API_KEY: "xq_test" }).searchTweets(
      "agent research",
      { maxResults: 5 },
    );

    expect(requests).toHaveLength(1);
    const url = new URL(requests[0]?.url ?? "");
    expect(url.origin).toBe("https://xquik.com");
    expect(url.pathname).toBe("/api/v1/x/tweets/search");
    expect(url.searchParams.get("q")).toBe("agent research");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(requests[0]?.headers.get("x-api-key")).toBe("xq_test");
    expect(result).toEqual({
      data: [{ id: "1", text: "Hermes Tweet powers X research." }],
      meta: { next_token: "next" },
    });
  });

  test("keeps OAuth as the default when both backends are configured", () => {
    expect(
      getHermesTweetConfig({
        X_CLIENT_ID: "client",
        HERMES_TWEET_API_KEY: "xq_test",
      }),
    ).toBeNull();
  });

  test("allows explicit Hermes Tweet read backend selection", () => {
    expect(
      getHermesTweetConfig({
        X_CLIENT_ID: "client",
        HERMES_TWEET_API_KEY: "xq_test",
        X_CLI_READ_BACKEND: "hermes-tweet",
        XQUIK_BASE_URL: "https://api.example.com/",
      }),
    ).toEqual({
      apiKey: "xq_test",
      baseUrl: "https://api.example.com/",
    });
  });

  test("normalizes user lookups for timeline commands", async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ user: { id: "u1", username: "example" } }), {
        status: 200,
      }),
    ) as typeof fetch;

    await expect(
      createClient({ XQUIK_API_KEY: "xq_test" }).getUser("example"),
    ).resolves.toEqual({
      user: { id: "u1", username: "example" },
      data: { id: "u1", username: "example" },
    });
  });
});
