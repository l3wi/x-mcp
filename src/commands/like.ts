import { z } from "incur";
import {
  envSchema,
  optionalEnvSchema,
  requireReadWriteMode,
  type Env,
} from "../lib/env.js";
import { createClient } from "../lib/api.js";
import { parseTweetId } from "../lib/utils.js";

export const likeCommand = {
  description:
    "Like a tweet. NOTE: Like access depends on your current X API plan and app permissions.",
  env: optionalEnvSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  async run(c: { env: Partial<Env>; args: { id: string } }) {
    requireReadWriteMode();
    console.error(
      "Warning: Like access depends on your current X API plan and app permissions.",
    );
    const client = createClient(envSchema.parse(c.env));
    const tid = parseTweetId(c.args.id);
    return client.likeTweet(tid);
  },
} as const;
