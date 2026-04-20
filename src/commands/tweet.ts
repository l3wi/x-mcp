import { Cli, z } from "incur";
import { envSchema, optionalEnvSchema, requireReadWriteMode } from "../lib/env.js";
import { createClient } from "../lib/api.js";
import { paginateCursor } from "../lib/pagination.js";
import { parseTweetId } from "../lib/utils.js";

export const tweet = Cli.create("tweet", {
  description: "Tweet operations",
});

tweet.command("post", {
  description: "Post a tweet",
  env: optionalEnvSchema,
  args: z.object({
    text: z.string().describe("Tweet text"),
  }),
  options: z.object({
    poll: z.string().optional().describe("Comma-separated poll options"),
    pollDuration: z
      .number()
      .default(1440)
      .describe("Poll duration in minutes"),
  }),
  async run(c) {
    requireReadWriteMode();
    const client = createClient(envSchema.parse(c.env));
    const pollOptions = c.options.poll
      ? c.options.poll.split(",").map((o) => o.trim())
      : undefined;
    const data = await client.postTweet(c.args.text, {
      pollOptions,
      pollDurationMinutes: c.options.pollDuration,
    });
    return data;
  },
});

tweet.command("get", {
  description: "Fetch a tweet by ID or URL",
  env: envSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const tid = parseTweetId(c.args.id);
    return client.getTweet(tid);
  },
});

tweet.command("delete", {
  description: "Delete a tweet",
  env: optionalEnvSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  async run(c) {
    requireReadWriteMode();
    const client = createClient(envSchema.parse(c.env));
    const tid = parseTweetId(c.args.id);
    return client.deleteTweet(tid);
  },
});

tweet.command("reply", {
  description:
    "Reply to a tweet. NOTE: Programmatic reply access depends on your current X API plan, app permissions, and conversation eligibility.",
  env: optionalEnvSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL to reply to"),
    text: z.string().describe("Reply text"),
  }),
  async run(c) {
    requireReadWriteMode();
    const client = createClient(envSchema.parse(c.env));
    const tid = parseTweetId(c.args.id);
    console.error(
      "Warning: Programmatic reply access depends on your current X API plan, " +
        "app permissions, and conversation eligibility.",
    );
    return client.postTweet(c.args.text, { replyTo: tid });
  },
});

tweet.command("quote", {
  description: "Quote tweet",
  env: optionalEnvSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL to quote"),
    text: z.string().describe("Quote text"),
  }),
  async run(c) {
    requireReadWriteMode();
    const client = createClient(envSchema.parse(c.env));
    const tid = parseTweetId(c.args.id);
    return client.postTweet(c.args.text, { quoteTweetId: tid });
  },
});

tweet.command("thread", {
  description:
    "Fetch compact tweet context: target tweet, conversation root, and quoted tweets.",
  env: envSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const tid = parseTweetId(c.args.id);
    return client.getThread(tid);
  },
});

tweet.command("context", {
  description:
    "Fetch a tweet with recent conversation context: target tweet and recent tweets in the same conversation.",
  env: envSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  options: z.object({
    max: z.number().default(10).describe("Max recent conversation tweets (10-100)"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const tid = parseTweetId(c.args.id);
    return client.getConversationContext(tid, c.options.max);
  },
});

tweet.command("search", {
  description: "Search recent tweets",
  env: envSchema,
  args: z.object({
    query: z.string().describe("Search query"),
  }),
  options: z.object({
    limit: z.number().default(10).describe("Total results to return"),
    pageSize: z.number().default(10).describe("Results per API request (10-100)"),
    cursor: z.string().optional().describe("X pagination cursor to start from"),
    offset: z.number().default(0).describe("Results to skip by walking cursor pages"),
  }),
  async run(c) {
    const client = createClient(c.env);
    return paginateCursor(c.options, (request) =>
      client.searchTweets(c.args.query, request),
    );
  },
});

tweet.command("metrics", {
  description:
    "Get tweet engagement metrics. NOTE: private metrics depend on your current X API plan and only work for eligible tweets.",
  env: envSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const tid = parseTweetId(c.args.id);
    return client.getTweetMetrics(tid);
  },
});
