import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";
import { ENCRYPTION_ALGORITHM, encryptBytes } from "./encrypt.js";
import {
  registerUploadedDatasetsOnSuiAndSeal,
  type RegisterUploadedDatasetInput,
} from "./suiSealRegistration.js";
import { uploadEncryptedBlob } from "./walrusClient.js";

type Role = "rider" | "merchant" | "consumer";

type SimulatorUser = {
  user_id: string;
  role: Role;
  sui_address: string;
};

type Contributor = {
  addr: string;
  role: Role;
  weight_bps: 10000;
};

type RawAsset = {
  asset_id: string;
  owner_id: string;
  owner: string;
  role: Role;
  data_type: string;
  contributors: Contributor[];
  created_at?: string;
  events?: unknown[];
  [key: string]: unknown;
};

type PersonalDataset = {
  user_id: string;
  owner_addr: string;
  role: Role;
  data_type: string;
  assets: RawAsset[];
  generated_at: string;
};

type UploadLogRecord = {
  user_id: string;
  owner_addr: string;
  role: Role;
  data_type: string;
  blob_id: string;
  contributors: Contributor[];
  encryption: {
    algorithm: typeof ENCRYPTION_ALGORITHM;
    key_ref: string;
    iv: string;
    auth_tag: string;
  };
  walrus: {
    network: "testnet";
    uploaded_at: string;
  };
};

const dataTypeByRole: Record<Role, string> = {
  rider: "rider_mobility",
  merchant: "merchant_operations",
  consumer: "consumer_behavior",
};

const acceptedRawDataTypesByRole: Record<Role, string[]> = {
  rider: ["rider_mobility"],
  merchant: ["merchant_operations"],
  consumer: ["consumer_behavior", "consumer_demand"],
};

const assertReadable = async (filePath: string, label: string): Promise<void> => {
  try {
    await access(filePath, constants.R_OK);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`${label} does not exist: ${filePath}`);
    }
    throw new Error(`${label} is not readable: ${filePath}`);
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

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const listJsonFiles = async (dir: string): Promise<string[]> => {
  await assertReadable(dir, "Raw assets directory");
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listJsonFiles(fullPath);
      }
      return entry.isFile() && entry.name.endsWith(".json") ? [fullPath] : [];
    }),
  );

  return files.flat().sort();
};

const assertAddress = (address: string, label: string): void => {
  if (!address.startsWith("0x")) {
    throw new Error(`${label} must start with 0x: ${address}`);
  }
};

const assertContributor = (asset: RawAsset, user: SimulatorUser): Contributor => {
  if (asset.contributors.length !== 1) {
    throw new Error(`${asset.asset_id} must have exactly one owner contributor`);
  }

  const contributor = asset.contributors[0];
  const totalWeight = asset.contributors.reduce((sum, item) => sum + item.weight_bps, 0);
  if (totalWeight !== 10000) {
    throw new Error(`${asset.asset_id} contributor weight_bps must sum to 10000, got ${totalWeight}`);
  }

  assertAddress(contributor.addr, `${asset.asset_id} contributor addr`);
  if (contributor.addr.toLowerCase() !== user.sui_address.toLowerCase()) {
    throw new Error(`${asset.asset_id} contributor address does not match simulator user address`);
  }

  if (contributor.role !== user.role) {
    throw new Error(`${asset.asset_id} contributor role does not match simulator user role`);
  }

  return contributor;
};

const validateUser = (user: SimulatorUser): void => {
  if (!user.user_id?.trim()) {
    throw new Error("Simulator user is missing user_id");
  }
  if (!["rider", "merchant", "consumer"].includes(user.role)) {
    throw new Error(`Unsupported simulator user role for ${user.user_id}: ${user.role}`);
  }
  assertAddress(user.sui_address, `${user.user_id} sui_address`);
};

const validateAssetForUser = (asset: RawAsset, user: SimulatorUser): Contributor => {
  if (asset.owner_id !== user.user_id) {
    throw new Error(`${asset.asset_id} owner_id ${asset.owner_id} does not match ${user.user_id}`);
  }
  if (asset.owner.toLowerCase() !== user.sui_address.toLowerCase()) {
    throw new Error(`${asset.asset_id} owner address does not match simulator user address`);
  }
  if (asset.role !== user.role) {
    throw new Error(`${asset.asset_id} role ${asset.role} does not match user role ${user.role}`);
  }
  if (!acceptedRawDataTypesByRole[user.role].includes(asset.data_type)) {
    throw new Error(
      `${asset.asset_id} data_type ${asset.data_type} does not match expected ${acceptedRawDataTypesByRole[
        user.role
      ].join(" or ")}`,
    );
  }

  return assertContributor(asset, user);
};

const loadUsers = async (): Promise<Map<string, SimulatorUser>> => {
  const users = await readJson<SimulatorUser[]>(config.usersPath);
  const byId = new Map<string, SimulatorUser>();
  const byAddress = new Map<string, string>();

  for (const user of users) {
    validateUser(user);
    const addressKey = user.sui_address.toLowerCase();
    const existingUserId = byAddress.get(addressKey);
    if (existingUserId && existingUserId !== user.user_id) {
      throw new Error(`Address ${user.sui_address} is assigned to both ${existingUserId} and ${user.user_id}`);
    }
    if (byId.has(user.user_id)) {
      throw new Error(`Duplicate simulator user_id: ${user.user_id}`);
    }
    byAddress.set(addressKey, user.user_id);
    byId.set(user.user_id, user);
  }

  return byId;
};

const loadPersonalDatasets = async (): Promise<Array<{ dataset: PersonalDataset; contributor: Contributor }>> => {
  const usersById = await loadUsers();
  const files = await listJsonFiles(config.rawAssetsDir);
  if (files.length === 0) {
    throw new Error(`No raw asset JSON files found in ${config.rawAssetsDir}`);
  }

  const datasets: Array<{ dataset: PersonalDataset; contributor: Contributor }> = [];

  for (const file of files) {
    const asset = await readJson<RawAsset>(file);
    const user = usersById.get(asset.owner_id);
    if (!user) {
      throw new Error(`${asset.asset_id} owner_id ${asset.owner_id} is missing from ${config.usersPath}`);
    }

    const contributor = validateAssetForUser(asset, user);
    datasets.push({
      contributor,
      dataset: {
        user_id: user.user_id,
        owner_addr: user.sui_address,
        role: user.role,
        data_type: dataTypeByRole[user.role],
        assets: [asset],
        generated_at: new Date().toISOString(),
      },
    });
  }

  return config.maxUploads ? datasets.slice(0, config.maxUploads) : datasets;
};

export const uploadDatasets = async (): Promise<UploadLogRecord[]> => {
  const datasets = await loadPersonalDatasets();
  await rm(config.outputDir, { recursive: true, force: true });
  await mkdir(config.encryptedDir, { recursive: true });

  const uploadLog: UploadLogRecord[] = [];
  const pendingSealRegistrations: RegisterUploadedDatasetInput[] = [];

  for (const { dataset, contributor } of datasets) {
    const plaintext = Buffer.from(JSON.stringify(dataset, null, 2), "utf8");
    const encrypted = encryptBytes(plaintext);
    const encryptedPath = path.join(config.encryptedDir, `${dataset.user_id}.bin`);

    await writeFile(encryptedPath, encrypted.ciphertext);
    const { blobId } = await uploadEncryptedBlob(encrypted.ciphertext);
    if (!blobId.trim()) {
      throw new Error(`Walrus returned empty blob_id for ${dataset.user_id}`);
    }

    const keyRef = `seal_registered_key:${dataset.user_id}`;
    const uploadedAt = new Date().toISOString();

    const manifestRecord: UploadLogRecord = {
      user_id: dataset.user_id,
      owner_addr: dataset.owner_addr,
      role: dataset.role,
      data_type: dataset.data_type,
      blob_id: blobId,
      contributors: [contributor],
      encryption: {
        algorithm: ENCRYPTION_ALGORITHM,
        key_ref: keyRef,
        iv: encrypted.iv.toString("hex"),
        auth_tag: encrypted.authTag.toString("hex"),
      },
      walrus: {
        network: "testnet",
        uploaded_at: uploadedAt,
      },
    };

    uploadLog.push(manifestRecord);
    pendingSealRegistrations.push({
      manifest: manifestRecord,
      aesKey: encrypted.key,
    });

    console.log(`${dataset.user_id} ${dataset.data_type} uploaded: ${blobId}`);
  }

  const { dataAssets, sealedKeys } = await registerUploadedDatasetsOnSuiAndSeal(pendingSealRegistrations);

  await writeFile(
    path.join(config.outputDir, "upload_log.jsonl"),
    `${uploadLog.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
  await writeJson(path.join(config.outputDir, "upload_manifest.json"), uploadLog);
  await mkdir(config.contractsOutputDir, { recursive: true });
  await writeJson(path.join(config.contractsOutputDir, "data_asset_registry.json"), dataAssets);
  await mkdir(config.sealAccessOutputDir, { recursive: true });
  await writeJson(path.join(config.sealAccessOutputDir, "seal_key_registry.json"), sealedKeys);

  return uploadLog;
};
