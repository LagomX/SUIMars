import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config";

const blobIdFromCiphertext = (ciphertext: Buffer): string =>
  createHash("sha256").update(ciphertext).digest("hex");

const execFileAsync = promisify(execFile);

const findBlobId = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const blobId = findBlobId(item);
      if (blobId) {
        return blobId;
      }
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["blobId", "blob_id", "blobID"]) {
    if (typeof record[key] === "string" && record[key].trim()) {
      return record[key];
    }
  }

  for (const [key, child] of Object.entries(record)) {
    if (/blob[_-]?id/i.test(key) && typeof child === "string" && child.trim()) {
      return child;
    }
  }

  for (const child of Object.values(record)) {
    const blobId = findBlobId(child);
    if (blobId) {
      return blobId;
    }
  }

  return undefined;
};

const parseWalrusBlobId = (stdout: string): string => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("Walrus CLI returned empty output");
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const blobId = findBlobId(parsed);
    if (blobId) {
      return blobId;
    }
  } catch {
    // Fall through to the text parser; some Walrus versions print human text
    // even when JSON is requested.
  }

  const textMatch =
    trimmed.match(/blob[_ -]?id["':\s]+([A-Za-z0-9_-]{20,})/i) ??
    trimmed.match(/\b([A-Za-z0-9_-]{40,})\b/);

  if (textMatch?.[1]) {
    return textMatch[1];
  }

  throw new Error(`Could not find a blob ID in Walrus output: ${trimmed.slice(0, 500)}`);
};

const uploadWithWalrusCli = async (ciphertext: Buffer): Promise<string> => {
  const tmpDir = path.join(config.outputDir, "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${randomUUID()}.bin`);

  try {
    await writeFile(tmpFile, ciphertext);
    const args = [
      ...(config.walrusConfig ? ["--config", config.walrusConfig] : []),
      "store",
      tmpFile,
      "--epochs",
      String(config.walrusEpochs),
      "--context",
      config.walrusContext,
      "--json",
    ];

    const { stdout } = await execFileAsync(config.walrusCliPath, args, {
      maxBuffer: 10 * 1024 * 1024,
    });

    return parseWalrusBlobId(stdout);
  } finally {
    await rm(tmpFile, { force: true });
  }
};

export const uploadEncryptedBlob = async (ciphertext: Buffer): Promise<string> => {
  if (ciphertext.length === 0) {
    throw new Error("Refusing to upload empty ciphertext");
  }

  if (config.walrusMock) {
    const blobId = blobIdFromCiphertext(ciphertext);
    const mockDir = path.join(config.outputDir, "mock-walrus");
    await mkdir(mockDir, { recursive: true });
    await writeFile(path.join(mockDir, `${blobId}.bin`), ciphertext);
    return blobId;
  }

  // Walrus data is public, so callers must continue passing encrypted
  // ciphertext only. The CLI path keeps the adapter stable while the SDK upload
  // surface evolves.
  return uploadWithWalrusCli(ciphertext);
};
