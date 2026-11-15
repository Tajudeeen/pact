import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { AccessContext, ProtectedResource } from "./contracts";

/**
 * Serves one server-configured file as the protected resource.
 * The path is never accepted from the request. Symlinks are resolved and
 * checked against the configured root before every read.
 */
export class FileProtectedResource implements ProtectedResource<Uint8Array> {
  private readonly rootPath: string;
  private readonly filePath: string;

  constructor(
    rootDirectory: string,
    relativeFilePath: string,
    private readonly maxBytes = 5 * 1024 * 1024,
  ) {
    if (!relativeFilePath.trim() || isAbsolute(relativeFilePath))
      throw new Error("Protected resource path must be relative to its configured root.");
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1)
      throw new Error("Protected resource size limit must be a positive safe integer.");

    this.rootPath = resolve(rootDirectory);
    this.filePath = resolve(this.rootPath, relativeFilePath);
    const withinRoot = relative(this.rootPath, this.filePath);
    if (
      !withinRoot ||
      withinRoot === "." ||
      withinRoot === ".." ||
      withinRoot.startsWith(".." + sep) ||
      isAbsolute(withinRoot)
    ) throw new Error("Protected resource path escapes its configured root.");
  }

  async deliver(_context: AccessContext, _idempotencyKey: string): Promise<Uint8Array> {
    const root = await realpath(this.rootPath);
    const file = await realpath(this.filePath);
    const withinRoot = relative(root, file);
    if (
      withinRoot === ".." ||
      withinRoot.startsWith(".." + sep) ||
      isAbsolute(withinRoot)
    ) throw new Error("Protected resource symlink escapes its configured root.");

    const handle = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new Error("Protected resource must be a regular file.");
      if (info.size > this.maxBytes)
        throw new Error("Protected resource exceeds its configured size limit.");
      const bytes = await handle.readFile();
      if (bytes.byteLength > this.maxBytes)
        throw new Error("Protected resource changed beyond its configured size limit.");
      return new Uint8Array(bytes);
    } finally {
      await handle.close();
    }
  }
}
