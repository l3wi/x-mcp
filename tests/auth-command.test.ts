import { afterEach, describe, expect, test, vi } from "vitest";
import { logoutWithOptionalRevocation } from "../src/commands/auth.js";
import { clearRuntimeAuth, getRuntimeTokens, setRuntimeTokens } from "../src/lib/runtime.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  clearRuntimeAuth();
  vi.restoreAllMocks();
});

describe("auth command behavior", () => {
  test("logout clears local runtime tokens even when credentials are missing", async () => {
    setRuntimeTokens({
      access_token: "access",
      refresh_token: "refresh",
      expires_at: 1_900_000_000,
      scope: "tweet.read offline.access",
    });

    const result = await logoutWithOptionalRevocation({});

    expect(result).toEqual({
      status: "logged_out",
      local_tokens: "deleted",
      remote_revocation: "skipped_missing_credentials",
    });
    expect(getRuntimeTokens()).toBeNull();
  });

  test("logout reports failed remote revocation when X rejects it", async () => {
    setRuntimeTokens({
      access_token: "access",
      refresh_token: "refresh",
      expires_at: 1_900_000_000,
      scope: "tweet.read offline.access",
    });
    globalThis.fetch = vi.fn(async () =>
      new Response("{}", { status: 500 }),
    ) as typeof fetch;

    const result = await logoutWithOptionalRevocation({ X_CLIENT_ID: "client" });

    expect(result).toEqual({
      status: "logged_out",
      local_tokens: "deleted",
      remote_revocation: "failed",
    });
    expect(getRuntimeTokens()).toBeNull();
  });
});
