import { describe, expect, test } from "vitest";
import { logoutWithOptionalRevocation } from "../src/commands/auth.js";
import { clearRuntimeAuth, getRuntimeTokens, setRuntimeTokens } from "../src/lib/runtime.js";

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

    clearRuntimeAuth();
  });
});
