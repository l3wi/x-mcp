import { Cli, z } from "incur";
import { getConfigMode, resolveLoginEnv, setConfigMode } from "../lib/env.js";
import { assertRequiredWriteScopes, login } from "../lib/oauth.js";
import { hasRequiredWriteScopes } from "../lib/scopes.js";
import { loadTokens, saveTokens } from "../lib/tokens.js";

export interface ConfigCommandOptions {
  includeMode?: boolean;
}

export function createConfigCommand(options: ConfigCommandOptions = {}) {
  const { includeMode = true } = options;
  const configCommand = Cli.create("config", {
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

  if (includeMode) {
    configCommand.command("mode", {
      description: "Set CLI mode: read-only or read-write",
      args: z.object({
        mode: z.enum(["read-only", "read-write"]).describe("CLI mode"),
      }),
      async run(c) {
        if (c.args.mode === "read-only") {
          const config = setConfigMode("read-only");
          return {
            mode: config.mode,
            reauthorized: false,
            message: "Read-only mode enabled. Write actions are disabled.",
          };
        }

        const currentTokens = loadTokens();
        if (!currentTokens) {
          throw new Error(
            "Read-write mode requires OAuth tokens with write scopes. Run `x-cli auth login --read-write` first.",
          );
        }

        if (hasRequiredWriteScopes(currentTokens.scope)) {
          const config = setConfigMode("read-write");
          return {
            mode: config.mode,
            reauthorized: false,
            message: "Read-write mode enabled.",
          };
        }

        console.error(
          "Read-write mode requires write OAuth scopes. Re-authorizing now...",
        );
        const env = await resolveLoginEnv();
        const tokens = await login(env, "read-write", { saveTokens: false });
        assertRequiredWriteScopes(tokens.scope);
        saveTokens(tokens);
        const config = setConfigMode("read-write");
        return {
          mode: config.mode,
          reauthorized: true,
          scope: tokens.scope,
          expires_at: new Date(tokens.expires_at * 1000).toISOString(),
        };
      },
    });
  }

  return configCommand;
}

export const configCommand = createConfigCommand();
