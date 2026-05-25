import { Cli, z } from "incur";
import { readEnvSchema } from "../lib/env.js";
import { createClient } from "../lib/api.js";
import { paginateCursor } from "../lib/pagination.js";
import { parseUsername } from "../lib/utils.js";

export const user = Cli.create("user", {
  description: "User operations",
});

user.command("get", {
  description: "Look up a user profile",
  env: readEnvSchema,
  args: z.object({
    username: z.string().describe("Username (with or without @)"),
  }),
  async run(c) {
    const client = createClient(c.env);
    return client.getUser(parseUsername(c.args.username));
  },
});

user.command("timeline", {
  description: "Fetch a user's recent tweets",
  env: readEnvSchema,
  args: z.object({
    username: z.string().describe("Username (with or without @)"),
  }),
  options: z.object({
    limit: z.number().default(10).describe("Total results to return"),
    pageSize: z.number().default(10).describe("Results per API request (5-100)"),
    cursor: z.string().optional().describe("X pagination cursor to start from"),
    offset: z.number().default(0).describe("Results to skip by walking cursor pages"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const uname = parseUsername(c.args.username);
    const userData = await client.getUser(uname);
    const userId = getTimelineLookupKey(userData, uname);
    return paginateCursor(c.options, (request) =>
      client.getTimeline(userId, request),
    );
  },
});

user.command("followers", {
  description: "List a user's followers",
  env: readEnvSchema,
  args: z.object({
    username: z.string().describe("Username (with or without @)"),
  }),
  options: z.object({
    limit: z.number().default(100).describe("Total results to return"),
    pageSize: z.number().default(100).describe("Results per API request (1-1000)"),
    cursor: z.string().optional().describe("X pagination cursor to start from"),
    offset: z.number().default(0).describe("Results to skip by walking cursor pages"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const uname = parseUsername(c.args.username);
    const userData = await client.getUser(uname);
    const userId = getTimelineLookupKey(userData, uname);
    return paginateCursor(c.options, (request) =>
      client.getFollowers(userId, request),
    );
  },
});

user.command("following", {
  description: "List who a user follows",
  env: readEnvSchema,
  args: z.object({
    username: z.string().describe("Username (with or without @)"),
  }),
  options: z.object({
    limit: z.number().default(100).describe("Total results to return"),
    pageSize: z.number().default(100).describe("Results per API request (1-1000)"),
    cursor: z.string().optional().describe("X pagination cursor to start from"),
    offset: z.number().default(0).describe("Results to skip by walking cursor pages"),
  }),
  async run(c) {
    const client = createClient(c.env);
    const uname = parseUsername(c.args.username);
    const userData = await client.getUser(uname);
    const userId = getTimelineLookupKey(userData, uname);
    return paginateCursor(c.options, (request) =>
      client.getFollowing(userId, request),
    );
  },
});

function getTimelineLookupKey(userData: Record<string, unknown>, fallback: string): string {
  const data = userData.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return fallback;
  const record = data as Record<string, unknown>;
  return firstString(record.id) || firstString(record.username) || fallback;
}

function firstString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}
