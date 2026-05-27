import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import type { DataAssetMetadata, Role } from "./types.js";

export type WalrusUploadRecord = DataAssetMetadata & {
  user_id: string;
  owner_addr: string;
  role: Role;
};

export type WalrusDatasetInput = {
  userId: string;
  metadata: DataAssetMetadata;
  encryptedBytes: Buffer;
  encryptedPath: string;
};

const assertReadable = async (filePath: string, label: string): Promise<void> => {
  try {
    await access(filePath, constants.R_OK);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    throw new Error(
      code === "ENOENT"
        ? `${label} does not exist: ${filePath}`
        : `${label} is not readable: ${filePath}`,
    );
  }
};

const readJson = async <T>(filePath: string): Promise<T> => {
  await assertReadable(filePath, "JSON file");
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
};

const validateMetadata = (record: WalrusUploadRecord): void => {
  if (!record.user_id?.trim()) {
    throw new Error("Walrus upload manifest record is missing user_id");
  }
  if (!record.blob_id?.trim()) {
    throw new Error(`${record.user_id} is missing blob_id`);
  }
  if (!record.data_type?.trim()) {
    throw new Error(`${record.user_id} is missing data_type`);
  }
  if (!Array.isArray(record.contributors) || record.contributors.length === 0) {
    throw new Error(`${record.user_id} contributors must be a non-empty array`);
  }
  if (record.encryption?.algorithm !== "AES-256-GCM") {
    throw new Error(`${record.user_id} uses unsupported encryption algorithm ${record.encryption?.algorithm}`);
  }
  if (!record.encryption.key_ref?.trim()) {
    throw new Error(`${record.user_id} is missing encryption.key_ref`);
  }
};

const selectRecord = (records: WalrusUploadRecord[], userId?: string): WalrusUploadRecord => {
  if (records.length === 0) {
    throw new Error("Walrus upload_manifest.json is empty");
  }

  const selected = userId
    ? records.find((record) => record.user_id === userId)
    : records[0];

  if (!selected) {
    throw new Error(`No Walrus upload record found for user_id ${userId}`);
  }

  validateMetadata(selected);
  return selected;
};

export const loadWalrusDatasetInput = async (
  userId?: string,
  walrusOutputDir = config.walrusOutputDir,
): Promise<WalrusDatasetInput> => {
  const manifestPath = path.join(walrusOutputDir, "upload_manifest.json");
  const records = await readJson<WalrusUploadRecord[]>(manifestPath);
  const selected = selectRecord(records, userId);

  const encryptedPath = path.join(walrusOutputDir, "encrypted", `${selected.user_id}.bin`);
  await assertReadable(encryptedPath, "Encrypted dataset");
  const encryptedBytes = await readFile(encryptedPath);
  if (encryptedBytes.length === 0) {
    throw new Error(`Encrypted dataset is empty: ${encryptedPath}`);
  }

  return {
    userId: selected.user_id,
    metadata: {
      blob_id: selected.blob_id,
      data_type: selected.data_type,
      contributors: selected.contributors,
      encryption: selected.encryption,
      walrus: selected.walrus,
    },
    encryptedBytes,
    encryptedPath,
  };
};
