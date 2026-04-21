export const WRITE_SCOPES = [
  "tweet.write",
  "like.write",
  "bookmark.write",
] as const;

export function hasRequiredWriteScopes(scope: string): boolean {
  const granted = new Set(scope.split(/\s+/).filter(Boolean));
  return WRITE_SCOPES.every((requiredScope) => granted.has(requiredScope));
}

export function assertRequiredWriteScopes(scope: string): void {
  if (hasRequiredWriteScopes(scope)) return;
  throw new Error(
    "X did not grant all required write scopes. Re-run `x-cli auth login --read-write` after checking your app permissions.",
  );
}
