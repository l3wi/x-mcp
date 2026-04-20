const TWEET_URL_RE = /(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/;

export function parseTweetId(input: string): string {
  const match = input.match(TWEET_URL_RE);
  if (match) return match[1];
  const stripped = input.trim();
  if (/^\d+$/.test(stripped)) return stripped;
  throw new Error(`Invalid tweet ID or URL: ${input}`);
}

export function stripAt(username: string): string {
  return username.startsWith("@") ? username.slice(1) : username;
}
