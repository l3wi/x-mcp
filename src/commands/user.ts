import { Cli, z } from "incur";
import { envSchema } from "../lib/env.js";
import { createClient } from "../lib/api.js";
import { paginateCursor } from "../lib/pagination.js";
import { stripAt } from "../lib/utils.js";

export const user = Cli.create("user", {
  description: "User operations",
});

user.command("get", {
  description: "Look up a user profile",
  env: envSchema,
  args: z.object({
    username: z.string().describe("Username (with or without @)"),
  }),
  async run(c) {
    const client = createClient(c.env);
    return client.getUser(stripAt(c.args.username));
  },
});

user.command("timeline", {
  description: "Fetch a user's recent tweets",
  env: envSchema,
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
    const uname = stripAt(c.args.username);
    const userData = (await client.getUser(uname)) as { data: { id: string } };
    return paginateCursor(c.options, (request) =>
      client.getTimeline(userData.data.id, request),
    );
  },
});

user.command("followers", {
  description: "List a user's followers",
  env: envSchema,
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
    const uname = stripAt(c.args.username);
    const userData = (await client.getUser(uname)) as { data: { id: string } };
    return paginateCursor(c.options, (request) =>
      client.getFollowers(userData.data.id, request),
    );
  },
});

user.command("following", {
  description: "List who a user follows",
  env: envSchema,
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
    const uname = stripAt(c.args.username);
    const userData = (await client.getUser(uname)) as { data: { id: string } };
    return paginateCursor(c.options, (request) =>
      client.getFollowing(userData.data.id, request),
    );
  },
});
