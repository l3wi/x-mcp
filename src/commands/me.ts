import { Cli, z } from "incur";
import {
  envSchema,
  optionalEnvSchema,
  requireReadWriteMode,
} from "../lib/env.js";
import { createClient } from "../lib/api.js";
import { paginateCursor } from "../lib/pagination.js";
import { parseTweetId } from "../lib/utils.js";

export interface MeCommandOptions {
  includeWrite?: boolean;
}

export function createMeCommand(options: MeCommandOptions = {}) {
  const { includeWrite = true } = options;
  const me = Cli.create("me", {
    description: "Self operations (authenticated user)",
  });

  me.command("mentions", {
    description: "Fetch your recent mentions",
    env: envSchema,
    options: z.object({
      limit: z.number().default(10).describe("Total results to return"),
      pageSize: z
        .number()
        .default(10)
        .describe("Results per API request (5-100)"),
      cursor: z.string().optional().describe("X pagination cursor to start from"),
      offset: z
        .number()
        .default(0)
        .describe("Results to skip by walking cursor pages"),
    }),
    async run(c) {
      const client = createClient(c.env);
      return paginateCursor(c.options, (request) =>
        client.getMentions(request),
      );
    },
  });

  me.command("bookmarks", {
    description: "Fetch your bookmarks",
    env: envSchema,
    options: z.object({
      limit: z.number().default(10).describe("Total results to return"),
      pageSize: z
        .number()
        .default(10)
        .describe("Results per API request (1-100)"),
      cursor: z.string().optional().describe("X pagination cursor to start from"),
      offset: z
        .number()
        .default(0)
        .describe("Results to skip by walking cursor pages"),
    }),
    async run(c) {
      const client = createClient(c.env);
      return paginateCursor(c.options, (request) =>
        client.getBookmarks(request),
      );
    },
  });

  if (includeWrite) {
    me.command("bookmark", {
      description: "Bookmark a tweet",
      env: optionalEnvSchema,
      args: z.object({
        id: z.string().describe("Tweet ID or URL"),
      }),
      async run(c) {
        requireReadWriteMode();
        const client = createClient(envSchema.parse(c.env));
        const tid = parseTweetId(c.args.id);
        return client.bookmarkTweet(tid);
      },
    });

    me.command("unbookmark", {
      description: "Remove a bookmark",
      env: optionalEnvSchema,
      args: z.object({
        id: z.string().describe("Tweet ID or URL"),
      }),
      async run(c) {
        requireReadWriteMode();
        const client = createClient(envSchema.parse(c.env));
        const tid = parseTweetId(c.args.id);
        return client.unbookmarkTweet(tid);
      },
    });
  }

  return me;
}

export const me = createMeCommand();
