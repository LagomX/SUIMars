import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "./config";

const execFileAsync = promisify(execFile);

const deterministicMockBlobId = (bytes: Buffer): string =>
  `mock_${createHash("sha256").update(bytes).digest("hex")}`;

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

const parseWalrusStoreOutput = (stdout: string): string => {
  const output = stdout.trim();
  if (!output) {
    throw new Error("Walrus CLI returned empty output");
  }

  try {
    const parsed = JSON.parse(output) as unknown;
    const blobId = findBlobId(parsed);
    if (blobId) {
      return blobId;
    }
  } catch {
    // Some CLI versions may emit human-readable text even when JSON is requested.
  }

  const match =
    output.match(/blob[_ -]?id["':\s]+([A-Za-z0-9_-]{20,})/i) ??
    output.match(/\b([A-Za-z0-9_-]{40,})\b/);

  if (!match?.[1]) {
    throw new Error(`Could not find a Walrus blob ID in CLI output: ${output.slice(0, 500)}`);
  }

  return match[1];
};

export const uploadEncryptedBlob = async (bytes: Buffer): Promise<{ blobId: string }> => {
  if (bytes.length === 0) {
    throw new Error("Refusing to upload empty encrypted bytes");
  }

  if (config.mockWalrus) {
    return { blobId: deterministicMockBlobId(bytes) };
  }

  const tmpDir = path.join(config.outputDir, "tmp");
  await mkdir(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${randomUUID()}.bin`);

  try {
    await writeFile(tmpFile, bytes);

    const args = [
      ...(config.walrusConfigPath ? ["--config", config.walrusConfigPath] : []),
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

    return { blobId: parseWalrusStoreOutput(stdout) };
  } catch (error) {
    throw new Error(
      `Walrus upload failed. Confirm the Walrus CLI is installed, funded, and configured for testnet. ${
        (error as Error).message
      }`,
    );
  } finally {
    await rm(tmpFile, { force: true });
  }
};
