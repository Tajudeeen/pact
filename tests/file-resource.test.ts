import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { FileProtectedResource } from "../server/access/file-resource";
import type { AccessContext } from "../server/access/contracts";

const context = {} as AccessContext;

describe("FileProtectedResource", () => {
  let root: string | undefined;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = undefined;
  });

  it("reads the configured file and returns bytes", async () => {
    root = await mkdtemp(join(tmpdir(), "pact-resource-"));
    await writeFile(join(root, "dataset.csv"), "day,value\n1,42\n");
    const resource = new FileProtectedResource(root, "dataset.csv");
    const bytes = await resource.deliver(context, "request-1");
    expect(new TextDecoder().decode(bytes)).toBe("day,value\n1,42\n");
  });

  it("rejects traversal and absolute paths at construction", async () => {
    root = await mkdtemp(join(tmpdir(), "pact-resource-"));
    expect(() => new FileProtectedResource(root!, "../secret.txt"))
      .toThrow("escapes");
    expect(() => new FileProtectedResource(root!, join(root!, "secret.txt")))
      .toThrow("relative");
  });

  it("rejects a symlink that resolves outside the protected root", async () => {
    root = await mkdtemp(join(tmpdir(), "pact-resource-"));
    const outside = await mkdtemp(join(tmpdir(), "pact-outside-"));
    await writeFile(join(outside, "secret.txt"), "secret");
    await symlink(join(outside, "secret.txt"), join(root, "dataset.csv"));
    const resource = new FileProtectedResource(root, "dataset.csv");
    await expect(resource.deliver(context, "request-1")).rejects.toThrow("symlink");
    await rm(outside, { recursive: true, force: true });
  });

  it("enforces the file size limit", async () => {
    root = await mkdtemp(join(tmpdir(), "pact-resource-"));
    await writeFile(join(root, "dataset.csv"), "123456");
    const resource = new FileProtectedResource(root, "dataset.csv", 5);
    await expect(resource.deliver(context, "request-1")).rejects.toThrow("size limit");
  });
});
