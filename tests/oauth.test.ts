import { afterEach, describe, expect, test, vi } from "vitest";
import {
  _buildAuthUrl,
  _generatePKCE,
  _hasRequiredWriteScopes,
  _revokeStoredTokens,
  refreshAccessToken,
} from "../src/lib/oauth.js";
import { clearRuntimeAuth, setRuntimeTokens } from "../src/lib/runtime.js";
import { loadTokens, type StoredTokens } from "../src/lib/tokens.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRuntimeAuth();
  vi.restoreAllMocks();
});

function storedTokens(): StoredTokens {
  return {
    access_token: "old-access",
    refresh_token: "old-refresh",
    expires_at: 1,
    scope: "tweet.read users.read offline.access",
  };
}

describe("PKCE", () => {
  test("generates verifier and challenge", () => {
    const { verifier, challenge } = _generatePKCE();
    expect(verifier).toBeTruthy();
    expect(challenge).toBeTruthy();
    expect(verifier).not.toBe(challenge);
    // Base64url: no +, /, or =
    expect(verifier).not.toMatch(/[+/=]/);
    expect(challenge).not.toMatch(/[+/=]/);
  });

  test("different calls produce different values", () => {
    const a = _generatePKCE();
    const b = _generatePKCE();
    expect(a.verifier).not.toBe(b.verifier);
    expect(a.challenge).not.toBe(b.challenge);
  });
});

describe("buildAuthUrl", () => {
  test("includes required OAuth 2.0 PKCE params", () => {
    const url = _buildAuthUrl("test-client-id", "test-state", "test-challenge");
    expect(url).toContain("response_type=code");
    expect(url).toContain("client_id=test-client-id");
    expect(url).toContain("state=test-state");
    expect(url).toContain("code_challenge=test-challenge");
    expect(url).toContain("code_challenge_method=S256");
    expect(url).toContain("redirect_uri=");
    expect(url).toContain("scope=");
  });

  test("requests offline.access scope", () => {
    const url = _buildAuthUrl("id", "state", "challenge");
    expect(url).toContain("offline.access");
  });

  test("requests bookmark scopes", () => {
    const url = _buildAuthUrl("id", "state", "challenge");
    expect(url).toContain("bookmark.read");
    expect(url).not.toContain("bookmark.write");
  });

  test("requests write scopes in read-write mode", () => {
    const url = _buildAuthUrl("id", "state", "challenge", "read-write");
    expect(url).toContain("tweet.write");
    expect(url).toContain("like.write");
    expect(url).toContain("bookmark.write");
  });
});

describe("revokeStoredTokens", () => {
  test("revokes access and refresh tokens", async () => {
    const requests: Array<{
      url: string;
      body: URLSearchParams;
      headers: HeadersInit | undefined;
    }> = [];
    const fetcher = async (
      input: URL | RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      requests.push({
        url: String(input),
        body: init?.body as URLSearchParams,
        headers: init?.headers,
      });
      return new Response("{}", { status: 200 });
    };

    await _revokeStoredTokens(
      {
        X_CLIENT_ID: "client-id",
      },
      {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        scope: "tweet.read offline.access",
      },
      fetcher,
    );

    expect(requests).toHaveLength(2);
    expect(requests.map((request) => request.url)).toEqual([
      "https://api.x.com/2/oauth2/revoke",
      "https://api.x.com/2/oauth2/revoke",
    ]);
    expect(requests.map((request) => request.body.get("token"))).toEqual([
      "access-token",
      "refresh-token",
    ]);
    expect(
      requests.map((request) => request.body.get("token_type_hint")),
    ).toEqual(["access_token", "refresh_token"]);
    expect(requests.map((request) => request.body.get("client_id"))).toEqual([
      "client-id",
      "client-id",
    ]);
  });

  test("fails when revocation endpoint rejects a token", async () => {
    const fetcher = async (): Promise<Response> =>
      new Response("{}", { status: 500 });

    await expect(
      _revokeStoredTokens(
        {
          X_CLIENT_ID: "client-id",
        },
        {
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          scope: "tweet.read offline.access",
        },
        fetcher,
      ),
    ).rejects.toThrow("revocations failed");
  });
});

describe("refreshAccessToken", () => {
  test("refreshes public-client tokens with client_id in the request body", async () => {
    setRuntimeTokens(storedTokens());
    const requests: Array<{
      body: URLSearchParams;
      headers: HeadersInit | undefined;
    }> = [];
    globalThis.fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      requests.push({
        body: init?.body as URLSearchParams,
        headers: init?.headers,
      });
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 7200,
          scope: "tweet.read users.read offline.access",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    const refreshed = await refreshAccessToken({ X_CLIENT_ID: "client-id" });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.body.get("grant_type")).toBe("refresh_token");
    expect(requests[0]?.body.get("refresh_token")).toBe("old-refresh");
    expect(requests[0]?.body.get("client_id")).toBe("client-id");
    expect(requests[0]?.headers).not.toHaveProperty("Authorization");
    expect(refreshed.access_token).toBe("new-access");
    expect(refreshed.refresh_token).toBe("new-refresh");
    expect(loadTokens()?.access_token).toBe("new-access");
  });

  test("refreshes confidential-client tokens with Basic auth", async () => {
    setRuntimeTokens(storedTokens());
    let requestBody: URLSearchParams | undefined;
    let requestHeaders: HeadersInit | undefined;
    globalThis.fetch = vi.fn(async (_input: URL | RequestInfo, init?: RequestInit) => {
      requestBody = init?.body as URLSearchParams;
      requestHeaders = init?.headers;
      return new Response(
        JSON.stringify({
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 7200,
          scope: "tweet.read users.read offline.access",
        }),
        { status: 200 },
      );
    }) as typeof fetch;

    await refreshAccessToken({
      X_CLIENT_ID: "client-id",
      X_CLIENT_SECRET: "client-secret",
    });

    expect(requestBody?.get("client_id")).toBeNull();
    expect((requestHeaders as Record<string, string>).Authorization).toBe(
      `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
    );
  });

  test("preserves existing refresh token and scope when refresh omits them", async () => {
    setRuntimeTokens(storedTokens());
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          access_token: "new-access",
          expires_in: 7200,
        }),
        { status: 200 },
      )
    ) as typeof fetch;

    const refreshed = await refreshAccessToken({ X_CLIENT_ID: "client-id" });

    expect(refreshed).toMatchObject({
      access_token: "new-access",
      refresh_token: "old-refresh",
      scope: "tweet.read users.read offline.access",
    });
  });

  test("rejects malformed refresh responses without overwriting tokens", async () => {
    const previous = storedTokens();
    setRuntimeTokens(previous);
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          refresh_token: "new-refresh",
          expires_in: 7200,
          scope: "tweet.read users.read offline.access",
        }),
        { status: 200 },
      )
    ) as typeof fetch;

    await expect(
      refreshAccessToken({ X_CLIENT_ID: "client-id" }),
    ).rejects.toThrow("missing access_token");
    expect(loadTokens()).toEqual(previous);
  });

  test("turns X refresh-token errors into re-login guidance", async () => {
    const previous = storedTokens();
    setRuntimeTokens(previous);
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "invalidrequest",
          errordescription: "Value passed for the token was invalid.",
        }),
        { status: 400 },
      )
    ) as typeof fetch;

    await expect(
      refreshAccessToken({ X_CLIENT_ID: "client-id" }),
    ).rejects.toThrow("Refresh token is no longer valid");
    await expect(
      refreshAccessToken({ X_CLIENT_ID: "client-id" }),
    ).rejects.toThrow("x-cli auth login");
    expect(loadTokens()).toEqual(previous);
  });

  test("parses OAuth error_description refresh failures", async () => {
    setRuntimeTokens(storedTokens());
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "Refresh token expired",
        }),
        { status: 400 },
      )
    ) as typeof fetch;

    await expect(
      refreshAccessToken({ X_CLIENT_ID: "client-id" }),
    ).rejects.toThrow("Refresh token expired");
  });
});

describe("write scopes", () => {
  test("requires every write scope for read-write mode", () => {
    expect(
      _hasRequiredWriteScopes(
        "tweet.read users.read offline.access tweet.write like.write bookmark.write",
      ),
    ).toBe(true);
    expect(
      _hasRequiredWriteScopes("tweet.read users.read offline.access tweet.write like.write"),
    ).toBe(false);
  });
});
