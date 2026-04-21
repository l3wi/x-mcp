import { describe, expect, test } from "vitest";
import {
  formatHelpForMode,
  prepareHelpArgv,
  stripGlobalOptions,
} from "../src/lib/help.js";

describe("prepareHelpArgv", () => {
  test("keeps global options on root help", () => {
    expect(prepareHelpArgv(["--help"])).toEqual({
      argv: ["--help"],
      hideGlobalOptions: false,
      isHelp: true,
    });
  });

  test("hides global options on subcommand help", () => {
    expect(prepareHelpArgv(["auth", "login", "--help"])).toEqual({
      argv: ["auth", "login", "--help"],
      hideGlobalOptions: true,
      isHelp: true,
    });
  });

  test("help-all keeps global options on subcommand help", () => {
    expect(prepareHelpArgv(["auth", "login", "--help-all"])).toEqual({
      argv: ["auth", "login", "--help"],
      hideGlobalOptions: false,
      isHelp: true,
    });
  });
});

describe("formatHelpForMode", () => {
  test("filters top-level write commands in read-only mode", () => {
    const output = formatHelpForMode(
      [
        "x-cli@0.2.0 - CLI",
        "",
        "Usage: x-cli <command>",
        "",
        "Commands:",
        "  auth     Authentication commands",
        "  like     Like a tweet",
        "  me       Self operations",
        "  retweet  Retweet a tweet",
        "  tweet    Tweet operations",
        "  user     User operations",
      ].join("\n"),
      { argv: ["--help"], mode: "read-only" },
    );

    expect(output).not.toContain("  like");
    expect(output).not.toContain("  retweet");
    expect(output).toContain("  tweet    Tweet operations");
    expect(output).toContain("Disabled Write Commands:");
    expect(output).toContain("- tweet post");
    expect(output).toContain("- me bookmark");
    expect(output).toContain("- like");
    expect(output).toContain("Enable with `x-cli config mode read-write`");
  });

  test("filters group write commands in read-only mode", () => {
    const output = formatHelpForMode(
      [
        "x-cli tweet - Tweet operations",
        "",
        "Usage: x-cli tweet <command>",
        "",
        "Commands:",
        "  context  Fetch context",
        "  delete   Delete a tweet",
        "  get      Fetch a tweet",
        "  post     Post a tweet",
        "  quote    Quote tweet",
        "  reply    Reply to a tweet",
        "  search   Search tweets",
        "  thread   Fetch compact context",
      ].join("\n"),
      { argv: ["tweet", "--help"], mode: "read-only" },
    );

    expect(output).toContain("  get      Fetch a tweet");
    expect(output).not.toContain("  post");
    expect(output).not.toContain("  delete");
    expect(output).not.toContain("  quote");
    expect(output).not.toContain("  reply");
    expect(output).toContain("- tweet post");
    expect(output).toContain("- tweet quote");
    expect(output).not.toContain("- me bookmark");
  });

  test("annotates direct disabled command help in read-only mode", () => {
    const output = formatHelpForMode(
      [
        "x-cli me bookmark - Bookmark a tweet",
        "",
        "Usage: x-cli me bookmark <id>",
        "",
        "Arguments:",
        "  id  Tweet ID or URL",
      ].join("\n"),
      { argv: ["me", "bookmark", "--help"], mode: "read-only" },
    );

    expect(output).toContain("Usage: x-cli me bookmark <id>");
    expect(output).toContain("Disabled Write Commands:");
    expect(output).toContain("- me bookmark");
  });

  test("does not filter help in read-write mode", () => {
    const help = [
      "x-cli me - Self operations",
      "",
      "Usage: x-cli me <command>",
      "",
      "Commands:",
      "  bookmark    Bookmark a tweet",
      "  bookmarks   Fetch bookmarks",
      "  unbookmark  Remove a bookmark",
    ].join("\n");

    expect(formatHelpForMode(help, { argv: ["me", "--help"], mode: "read-write" })).toBe(help);
  });
});

describe("stripGlobalOptions", () => {
  test("removes global options block", () => {
    expect(
      stripGlobalOptions(
        [
          "Usage: x-cli auth login",
          "",
          "Options:",
          "  --read-write",
          "",
          "Global Options:",
          "  --format <format>",
          "  --help",
        ].join("\n"),
      ),
    ).toBe(["Usage: x-cli auth login", "", "Options:", "  --read-write"].join("\n"));
  });
});
