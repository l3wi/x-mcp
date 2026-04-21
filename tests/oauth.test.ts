import { describe, expect, test } from "vitest";
import {
  _buildAuthUrl,
  _generatePKCE,
  _hasRequiredWriteScopes,
  _revokeStoredTokens,
} from "../src/lib/oauth.js";

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
