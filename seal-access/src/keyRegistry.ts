import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { config, projectRoot } from "./config.js";
import type {
  DataAssetRegistryRecord,
  DataLicenseRegistryRecord,
  SealKeyRegistryRecord,
} from "./types.js";

export const sealKeyRegistryPath = path.join(config.outputDir, "seal_key_registry.json");

const assertReadable = async (filePath: string, label: string): Promise<void> => {
  try {
    await access(filePath, constants.R_OK);
  } catch {
    throw new Error(`${label} does not exist or is not readable: ${filePath}`);
  }
};

export const readJson = async <T>(filePath: string, label: string): Promise<T> => {
  await assertReadable(filePath, label);
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${(error as Error).message}`);
  }
};

export const parsePublishedPackageIds = async (): Promise<{ originalId: string; publishedAt: string }> => {
  if (config.sealPackageId?.startsWith("0x")) {
    return { originalId: config.sealPackageId, publishedAt: config.sealPackageId };
  }

  const publishedToml = await readFile(
    path.join(projectRoot, "contracts", "mars", "Published.toml"),
    "utf8",
  );
  const section = publishedToml.match(/\[published\.testnet\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const publishedAt = section?.match(/published-at\s*=\s*"([^"]+)"/)?.[1];
  const originalId = section?.match(/original-id\s*=\s*"([^"]+)"/)?.[1] ?? publishedAt;

  if (!originalId?.startsWith("0x") || !publishedAt?.startsWith("0x")) {
    throw new Error("SEAL_PACKAGE_ID is unset and contracts/mars/Published.toml has no testnet package id");
  }
  return { originalId, publishedAt };
};

export const parsePublishedPackageId = async (): Promise<string> =>
  (await parsePublishedPackageIds()).publishedAt;

export const loadDataAssetRegistry = async (): Promise<DataAssetRegistryRecord[]> =>
  readJson<DataAssetRegistryRecord[]>(
    path.join(config.contractsOutputDir, "data_asset_registry.json"),
    "DataAsset registry",
  );

export const loadDataLicenseRegistry = async (): Promise<DataLicenseRegistryRecord[]> =>
  readJson<DataLicenseRegistryRecord[]>(
    path.join(config.contractsOutputDir, "data_license_registry.json"),
    "DataLicense registry",
  );

export const loadSealKeyRegistry = async (): Promise<SealKeyRegistryRecord[]> =>
  readJson<SealKeyRegistryRecord[]>(sealKeyRegistryPath, "Seal key registry");

export const selectDataAsset = (
  records: DataAssetRegistryRecord[],
  userId?: string,
): DataAssetRegistryRecord => {
  const selected = userId
    ? records.find((record) => record.user_id === userId || record.shard_id === userId)
    : records[0];
  if (!selected) {
    throw new Error(userId ? `No DataAsset registry record for ${userId}` : "DataAsset registry is empty");
  }
  if (!selected.data_asset_id?.startsWith("0x")) {
    throw new Error(`${selected.shard_id ?? selected.user_id} has invalid data_asset_id ${selected.data_asset_id}`);
  }
  return selected;
};

export const selectLicense = (
  records: DataLicenseRegistryRecord[],
  dataAssetId: string,
): DataLicenseRegistryRecord => {
  const selected = records.find((record) => record.data_asset_id === dataAssetId);
  if (!selected) {
    throw new Error(`No DataLicense registry record for DataAsset ${dataAssetId}`);
  }
  if (!selected.data_license_id?.startsWith("0x")) {
    throw new Error(`${selected.shard_id ?? selected.user_id} has invalid data_license_id ${selected.data_license_id}`);
  }
  return selected;
};

export const selectSealedKey = (
  records: SealKeyRegistryRecord[],
  dataAssetId: string,
): SealKeyRegistryRecord => {
  const selected = records.find((record) => record.data_asset_id === dataAssetId);
  if (!selected) {
    throw new Error(
      `No Seal key registry record for DataAsset ${dataAssetId}. ` +
        "Run walrus-uploader/pnpm upload so key registration happens while the AES key is still in memory.",
    );
  }
  return selected;
};
