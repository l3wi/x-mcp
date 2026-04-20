import { describe, expect, test } from "vitest";
import { parseTweetId, stripAt } from "../src/lib/utils.js";

describe("parseTweetId", () => {
  test("raw numeric string", () => {
    expect(parseTweetId("1234567890")).toBe("1234567890");
  });

  test("numeric string with whitespace", () => {
    expect(parseTweetId("  1234567890  ")).toBe("1234567890");
  });

  test("x.com URL", () => {
    expect(parseTweetId("https://x.com/user/status/1234567890")).toBe(
      "1234567890",
    );
  });

  test("twitter.com URL", () => {
    expect(parseTweetId("https://twitter.com/user/status/1234567890")).toBe(
      "1234567890",
    );
  });

  test("URL with query params", () => {
    expect(
      parseTweetId("https://x.com/user/status/1234567890?s=20&t=abc"),
    ).toBe("1234567890");
  });

  test("invalid input throws", () => {
    expect(() => parseTweetId("not-a-tweet")).toThrow("Invalid tweet ID or URL");
  });

  test("empty string throws", () => {
    expect(() => parseTweetId("")).toThrow("Invalid tweet ID or URL");
  });
});

describe("stripAt", () => {
  test("removes @ prefix", () => {
    expect(stripAt("@elonmusk")).toBe("elonmusk");
  });

  test("no @ prefix unchanged", () => {
    expect(stripAt("elonmusk")).toBe("elonmusk");
  });

  test("empty string", () => {
    expect(stripAt("")).toBe("");
  });

  test("only removes first @", () => {
    expect(stripAt("@@double")).toBe("@double");
  });
});
