import { Cli, z } from "incur";
import { getConfigMode, resolveLoginEnv, setConfigMode } from "../lib/env.js";
import { assertRequiredWriteScopes, login } from "../lib/oauth.js";
import { loadTokens } from "../lib/tokens.js";

export const configCommand = Cli.create("config", {
  description: "Configuration commands",
});

configCommand.command("show", {
  description: "Show current CLI configuration",
  run() {
    return {
      mode: getConfigMode(),
    };
  },
});

configCommand.command("mode", {
  description: "Set CLI mode: read-only or read-write",
  args: z.object({
    mode: z.enum(["read-only", "read-write"]).describe("CLI mode"),
  }),
  async run(c) {
    const previousMode = getConfigMode();
    if (c.args.mode === "read-only") {
      const config = setConfigMode("read-only");
      return {
        mode: config.mode,
        reauthorized: false,
        message: "Read-only mode enabled. Write actions are disabled.",
      };
    }

    const shouldReauthorize =
      previousMode !== "read-write" &&
      loadTokens() !== null;

    if (shouldReauthorize) {
      console.error(
        "Read-write mode requires write OAuth scopes. Re-authorizing now...",
      );
      const env = await resolveLoginEnv();
      const tokens = await login(env, "read-write");
      assertRequiredWriteScopes(tokens.scope);
      const config = setConfigMode("read-write");
      return {
        mode: config.mode,
        reauthorized: true,
        scope: tokens.scope,
        expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      };
    }

    const config = setConfigMode("read-write");
    return {
      mode: config.mode,
      reauthorized: false,
      message: "Read-write mode enabled.",
    };
  },
});
