import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DataLicense, KeyRecord, UploadResult } from "./types";

const ROOT_DIR = path.resolve(process.cwd(), "..");

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

export interface SealContext {
  assets: UploadResult[];
  keys: KeyRecord[];
  licenses: DataLicense[];
  assetById: Map<string, UploadResult>;
  keyByAssetId: Map<string, KeyRecord>;
  licensesByAssetId: Map<string, DataLicense[]>;
}

export const loadSealContext = async (): Promise<SealContext> => {
  const assets = await readJson<UploadResult[]>(
    path.join(ROOT_DIR, "walrus-uploader/output/upload_results.json"),
  );
  const keys = await readJson<KeyRecord[]>(path.join(ROOT_DIR, "walrus-uploader/output/keys.json"));
  const licenses = await readJson<DataLicense[]>(
    path.join(ROOT_DIR, "license-flow/output/data_licenses.json"),
  );

  const assetById = new Map(assets.map((asset) => [asset.asset_id, asset]));
  const keyByAssetId = new Map(keys.map((key) => [key.asset_id, key]));
  const licensesByAssetId = new Map<string, DataLicense[]>();

  for (const license of licenses) {
    const assetLicenses = licensesByAssetId.get(license.asset_id) ?? [];
    assetLicenses.push(license);
    licensesByAssetId.set(license.asset_id, assetLicenses);
  }

  return { assets, keys, licenses, assetById, keyByAssetId, licensesByAssetId };
};
