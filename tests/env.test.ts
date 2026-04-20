import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import {
  getConfigMode,
  loadConfigJson,
  requireReadWriteMode,
  saveConfigJson,
  setConfigMode,
} from "../src/lib/env.js";

const originalClientId = process.env.X_CLIENT_ID;
const originalClientSecret = process.env.X_CLIENT_SECRET;

function restoreEnv() {
  if (originalClientId === undefined) {
    delete process.env.X_CLIENT_ID;
  } else {
    process.env.X_CLIENT_ID = originalClientId;
  }
  if (originalClientSecret === undefined) {
    delete process.env.X_CLIENT_SECRET;
  } else {
    process.env.X_CLIENT_SECRET = originalClientSecret;
  }
}

describe("config JSON", () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(process.cwd(), ".tmp-env-test-"));
    path = join(dir, "config.json");
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
  });

  afterEach(() => {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  });

  test("saves config JSON and loads it into process env", () => {
    saveConfigJson(
      {
        X_CLIENT_ID: " client-id ",
        X_CLIENT_SECRET: " client-secret ",
      },
      path,
    );

    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    const config = loadConfigJson(path);
    const env = process.env as Record<string, string | undefined>;

    expect(config).toEqual({
      X_CLIENT_ID: "client-id",
      X_CLIENT_SECRET: "client-secret",
      mode: "read-only",
    });
    expect(env.X_CLIENT_ID).toBe("client-id");
    expect(env.X_CLIENT_SECRET).toBe("client-secret");
  });

  test("omits empty optional secret", () => {
    saveConfigJson(
      {
        X_CLIENT_ID: "client-id",
        X_CLIENT_SECRET: " ",
      },
      path,
    );

    delete process.env.X_CLIENT_ID;
    const config = loadConfigJson(path);
    const env = process.env as Record<string, string | undefined>;

    expect(config).toEqual({
      X_CLIENT_ID: "client-id",
      mode: "read-only",
    });
    expect(env.X_CLIENT_ID).toBe("client-id");
    expect(env.X_CLIENT_SECRET).toBeUndefined();
  });

  test("defaults to read-only mode", () => {
    expect(getConfigMode(path)).toBe("read-only");
  });

  test("persists read-write mode", () => {
    const config = setConfigMode("read-write", path);

    expect(config).toEqual({
      mode: "read-write",
    });
    expect(getConfigMode(path)).toBe("read-write");
  });

  test("read-write guard rejects read-only mode", () => {
    saveConfigJson({ mode: "read-only" }, path);

    expect(() => requireReadWriteMode(path)).toThrow(
      "requires read-write mode",
    );
  });

  test("read-write guard allows read-write mode", () => {
    saveConfigJson({ mode: "read-write" }, path);

    expect(() => requireReadWriteMode(path)).not.toThrow();
  });
});
