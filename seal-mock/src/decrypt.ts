import { createDecipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ReleasedKeyData } from "./types";

const MOCK_WALRUS_DIR = path.resolve(process.cwd(), "../walrus-uploader/output/mock-walrus");

const decryptJson = (
  ciphertext: Buffer,
  keyHex: string,
  ivHex: string,
  authTagHex: string,
): unknown => {
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as unknown;
};

const assertDecryptedShape = (data: unknown): { data_type: string; order_count: number } => {
  if (typeof data !== "object" || data === null) {
    throw new Error("Decrypted payload is not an object");
  }

  const payload = data as { data_type?: unknown; orders?: unknown };
  if (typeof payload.data_type !== "string") {
    throw new Error("Decrypted payload missing data_type");
  }
  if (!Array.isArray(payload.orders)) {
    throw new Error("Decrypted payload missing orders array");
  }

  return { data_type: payload.data_type, order_count: payload.orders.length };
};

export const decryptBlob = async (
  assetId: string,
  releasedKeyData: ReleasedKeyData,
): Promise<{ data: unknown; data_type: string; order_count: number }> => {
  if (assetId !== releasedKeyData.asset_id) {
    throw new Error("Released key data does not match requested asset");
  }

  const ciphertext = await readFile(path.join(MOCK_WALRUS_DIR, `${releasedKeyData.blob_id}.bin`));
  if (ciphertext.length === 0) {
    throw new Error("Encrypted blob is empty");
  }

  const data = decryptJson(
    ciphertext,
    releasedKeyData.keyHex,
    releasedKeyData.ivHex,
    releasedKeyData.authTagHex,
  );
  const shape = assertDecryptedShape(data);
  return { data, ...shape };
};
