import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";

const blobIdFromCiphertext = (ciphertext: Buffer): string =>
  createHash("sha256").update(ciphertext).digest("hex");

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

  // TODO: Wire this adapter to the current @mysten/walrus client once real mode
  // is enabled for the project. Keep this isolated because the Walrus SDK upload
  // surface is evolving; the rest of the pipeline already works with a string blob_id.
  // Walrus data is public, so callers must continue passing encrypted ciphertext only.
  throw new Error(
    "Real Walrus upload is not configured yet. Set WALRUS_MOCK=true to use the offline mock uploader.",
  );
};
