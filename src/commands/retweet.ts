import { z } from "incur";
import {
  envSchema,
  optionalEnvSchema,
  requireReadWriteMode,
  type Env,
} from "../lib/env.js";
import { createClient } from "../lib/api.js";
import { parseTweetId } from "../lib/utils.js";

export const retweetCommand = {
  description: "Retweet a tweet",
  env: optionalEnvSchema,
  args: z.object({
    id: z.string().describe("Tweet ID or URL"),
  }),
  async run(c: { env: Partial<Env>; args: { id: string } }) {
    requireReadWriteMode();
    const client = createClient(envSchema.parse(c.env));
    const tid = parseTweetId(c.args.id);
    return client.retweet(tid);
  },
} as const;
