import type { CliMode } from "./env.js";

const WRITE_COMMANDS = [
  "tweet post",
  "tweet delete",
  "tweet reply",
  "tweet quote",
  "me bookmark",
  "me unbookmark",
  "like",
  "retweet",
] as const;

export function prepareHelpArgv(argv: string[]): {
  argv: string[];
  hideGlobalOptions: boolean;
  isHelp: boolean;
} {
  const hasHelpAll = argv.includes("--help-all");
  const normalizedArgv = hasHelpAll
    ? argv.map((arg) => (arg === "--help-all" ? "--help" : arg))
    : argv;
  const isHelp = hasHelp(normalizedArgv);

  return {
    argv: normalizedArgv,
    hideGlobalOptions: !hasHelpAll && isSubcommandHelp(normalizedArgv),
    isHelp,
  };
}

export function stripGlobalOptions(helpText: string): string {
  const marker = "\nGlobal Options:\n";
  const start = helpText.indexOf(marker);
  if (start === -1) return helpText;

  const nextSection = helpText.indexOf("\n\n", start + marker.length);
  if (nextSection === -1) return helpText.slice(0, start).trimEnd();

  return `${helpText.slice(0, start).trimEnd()}${helpText.slice(nextSection)}`;
}

function isSubcommandHelp(argv: string[]): boolean {
  if (!hasHelp(argv)) return false;
  return argv.some((arg) => !arg.startsWith("-"));
}

function hasHelp(argv: string[]): boolean {
  return argv.some((arg) => arg === "--help" || arg === "-h");
}

export function formatHelpForMode(
  helpText: string,
  options: {
    argv: string[];
    mode: CliMode;
  },
): string {
  if (options.mode === "read-write") return helpText;

  const path = commandPathFromArgv(options.argv);
  const disabledCommands = disabledCommandsForPath(path);
  if (disabledCommands.length === 0) return helpText;

  const filtered = filterCommandsSection(helpText, path, disabledCommands);
  return appendDisabledCommands(filtered, disabledCommands);
}

function commandPathFromArgv(argv: string[]): string[] {
  const path: string[] = [];
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") break;
    if (arg.startsWith("-")) continue;
    path.push(arg);
  }
  return path;
}

function disabledCommandsForPath(path: string[]): string[] {
  const prefix = path.join(" ");
  if (!prefix) return [...WRITE_COMMANDS];
  if (WRITE_COMMANDS.includes(prefix as (typeof WRITE_COMMANDS)[number])) {
    return [prefix];
  }
  return WRITE_COMMANDS.filter((command) => command.startsWith(`${prefix} `));
}

function filterCommandsSection(
  helpText: string,
  path: string[],
  disabledCommands: string[],
): string {
  const commandNames = disabledCommandNamesForMenu(path, disabledCommands);
  if (commandNames.size === 0) return helpText;

  const lines = helpText.split("\n");
  let inCommands = false;
  return lines
    .filter((line) => {
      if (line === "Commands:") {
        inCommands = true;
        return true;
      }
      if (inCommands && line === "") {
        inCommands = false;
        return true;
      }
      if (!inCommands) return true;

      const commandName = line.match(/^  (\S+)/)?.[1];
      return !commandName || !commandNames.has(commandName);
    })
    .join("\n");
}

function disabledCommandNamesForMenu(
  path: string[],
  disabledCommands: string[],
): Set<string> {
  if (path.length === 0) {
    return new Set(
      disabledCommands
        .filter((command) => !command.includes(" "))
        .map((command) => command.split(" ")[0] as string),
    );
  }
  if (path.length === 1) {
    return new Set(
      disabledCommands
        .map((command) => command.split(" ")[1])
        .filter((command): command is string => !!command),
    );
  }
  return new Set();
}

function appendDisabledCommands(
  helpText: string,
  disabledCommands: string[],
): string {
  return [
    helpText.trimEnd(),
    "",
    "Disabled Write Commands:",
    ...disabledCommands.map((command) => `  - ${command}`),
    "",
    "Enable with `x-mcp config mode read-write`.",
  ].join("\n");
}
