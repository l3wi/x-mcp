import { describe, expect, test } from "vitest";
import { isExpired, type StoredTokens } from "../src/lib/tokens.js";

describe("isExpired", () => {
  test("future token is not expired", () => {
    const tokens: StoredTokens = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      scope: "tweet.read",
    };
    expect(isExpired(tokens)).toBe(false);
  });

  test("past token is expired", () => {
    const tokens: StoredTokens = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) - 100,
      scope: "tweet.read",
    };
    expect(isExpired(tokens)).toBe(true);
  });

  test("token within 60s buffer is expired", () => {
    const tokens: StoredTokens = {
      access_token: "test",
      refresh_token: "test",
      expires_at: Math.floor(Date.now() / 1000) + 30,
      scope: "tweet.read",
    };
    expect(isExpired(tokens)).toBe(true);
  });
});
