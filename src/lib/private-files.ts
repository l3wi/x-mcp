import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "fs";
import { basename, dirname, join } from "path";

export function readPrivateTextFile(path: string): string | null {
  if (!existsSync(path)) return null;
  assertPrivateFile(path);
  return readFileSync(path, "utf-8");
}

export function writePrivateTextFile(path: string, contents: string): void {
  const dir = dirname(path);
  ensurePrivateDirectory(dir);
  if (existsSync(path)) assertPrivateFile(path);

  const tmp = join(
    dir,
    `.${basename(path)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(tmp, contents, { mode: 0o600, flag: "wx" });
    renameSync(tmp, path);
    chmodSync(path, 0o600);
  } catch (error) {
    if (existsSync(tmp)) unlinkSync(tmp);
    throw error;
  }
}

export function ensurePrivateDirectory(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    chmodSync(path, 0o700);
    return;
  }
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`Refusing to use unsafe config directory: ${path}`);
  }
  assertOwner(path, stat.uid);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      `Refusing to use config directory with loose permissions: ${path}`,
    );
  }
}

function assertPrivateFile(path: string): void {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error(`Refusing to use unsafe credential file: ${path}`);
  }
  assertOwner(path, stat.uid);
  if ((stat.mode & 0o077) !== 0) {
    throw new Error(
      `Refusing to use credential file with loose permissions: ${path}`,
    );
  }
}

function assertOwner(path: string, uid: number): void {
  if (typeof process.getuid !== "function") return;
  if (uid !== process.getuid()) {
    throw new Error(
      `Refusing to use credential path owned by another user: ${path}`,
    );
  }
}
