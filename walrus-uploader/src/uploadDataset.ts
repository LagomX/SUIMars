import { constants } from "node:fs";
import { access, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { config } from "./config.js";
import { ENCRYPTION_ALGORITHM, encryptBytes } from "./encrypt.js";
import {
  registerUploadedDatasetsOnSuiAndSeal,
  type RegisterUploadedDatasetInput,
  type UploadManifestRecord,
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
  events?: Array<{ timestamp?: string; [key: string]: unknown }>;
  [key: string]: unknown;
};

type ListingAuthorization = {
  user_id: string;
  user_address: string;
  data_type: string;
  region: string;
  epoch: string;
  scope: "aggregate_and_list";
  expires_at: string;
  revocable: true;
  signature: string;
};

type ContributorAccountingRecord = {
  shard_id: string;
  user_id: string;
  user_address: string;
  role: Role;
  data_type: string;
  region: string;
  epoch: string;
  asset_id: string;
  event_count: number;
  share_ppm: number;
  claimable_micro_usdc: 0;
  authorization_signature: string;
};

type DatasetShard = {
  shard_id: string;
  dataset_collection_id: string;
  data_type: string;
  region: string;
  epoch: string;
  generated_at: string;
  authorization_scope: "aggregate_and_list";
  shard_content_hash: string;
  contributor_root: string;
  authorization_root: string;
  accounting_root: string;
  total_contributors: number;
  total_events: number;
  contributor_count: number;
  asset_count: number;
  event_count: number;
  assets: RawAsset[];
};

const dataTypeByRole: Record<Role, string> = {
  rider: "rider_mobility",
  merchant: "merchant_operations",
  consumer: "consumer_behavior",
};

const acceptedRawDataTypesByRole: Record<Role, string[]> = {
  rider: ["rider_mobility"],
  merchant: ["merchant_operations"],
  consumer: ["consumer_behavior"],
};

const DEFAULT_REGION = "santa_monica";
const AUTH_SCOPE = "aggregate_and_list" as const;

const concurrentMap = async <T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
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

const stableJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

const sha256Hex = (value: unknown): string =>
  createHash("sha256").update(stableJson(value)).digest("hex");

const deterministicPlaceholderRoot = (leaves: unknown[]): string => {
  const leafHashes = leaves.map(sha256Hex).sort();
  return createHash("sha256").update(leafHashes.join("")).digest("hex");
};

const listJsonFiles = async (dir: string): Promise<string[]> => {
  await assertReadable(dir, "Raw assets directory");
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) return listJsonFiles(fullPath);
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
  if (!user.user_id?.trim()) throw new Error("Simulator user is missing user_id");
  if (!["rider", "merchant", "consumer"].includes(user.role)) {
    throw new Error(`Unsupported simulator user role for ${user.user_id}: ${user.role}`);
  }
  assertAddress(user.sui_address, `${user.user_id} sui_address`);
};

const validateAssetForUser = (asset: RawAsset, user: SimulatorUser): void => {
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
  assertContributor(asset, user);
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
    if (byId.has(user.user_id)) throw new Error(`Duplicate simulator user_id: ${user.user_id}`);
    byAddress.set(addressKey, user.user_id);
    byId.set(user.user_id, user);
  }

  return byId;
};

const isoWeek = (dateString?: string): string => {
  const date = dateString ? new Date(dateString) : new Date();
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};

const listingAuthorizationFor = (
  user: SimulatorUser,
  asset: RawAsset,
): ListingAuthorization => {
  const region = DEFAULT_REGION;
  const epoch = isoWeek(asset.created_at);
  const unsigned = {
    user_id: user.user_id,
    user_address: user.sui_address,
    data_type: asset.data_type,
    region,
    epoch,
    scope: AUTH_SCOPE,
    expires_at: "2026-12-31T23:59:59Z",
    revocable: true as const,
  };

  return {
    ...unsigned,
    signature: `simulated:${sha256Hex(unsigned)}`,
  };
};

const isAuthorizationValid = (
  auth: ListingAuthorization,
  user: SimulatorUser,
  asset: RawAsset,
): boolean =>
  auth.user_id === user.user_id &&
  auth.user_address.toLowerCase() === user.sui_address.toLowerCase() &&
  auth.data_type === asset.data_type &&
  auth.scope === AUTH_SCOPE &&
  auth.revocable === true &&
  new Date(auth.expires_at).getTime() > Date.now() &&
  auth.signature.startsWith("simulated:");

const loadAuthorizedAssets = async (): Promise<Array<{ asset: RawAsset; user: SimulatorUser; auth: ListingAuthorization }>> => {
  const usersById = await loadUsers();
  const files = await listJsonFiles(config.rawAssetsDir);
  if (files.length === 0) {
    throw new Error(`No raw asset JSON files found in ${config.rawAssetsDir}`);
  }

  const authorized: Array<{ asset: RawAsset; user: SimulatorUser; auth: ListingAuthorization }> = [];

  for (const file of files) {
    const asset = await readJson<RawAsset>(file);
    const user = usersById.get(asset.owner_id);
    if (!user) {
      throw new Error(`${asset.asset_id} owner_id ${asset.owner_id} is missing from ${config.usersPath}`);
    }

    validateAssetForUser(asset, user);
    const auth = listingAuthorizationFor(user, asset);
    if (isAuthorizationValid(auth, user, asset)) {
      authorized.push({ asset, user, auth });
    }
  }

  return authorized;
};

const sharePpmFor = (index: number, count: number): number => {
  const base = Math.floor(1_000_000 / count);
  const remainder = 1_000_000 - base * count;
  return base + (index < remainder ? 1 : 0);
};

const buildShards = (
  authorized: Array<{ asset: RawAsset; user: SimulatorUser; auth: ListingAuthorization }>,
): { shards: DatasetShard[]; authorizations: ListingAuthorization[]; accounting: ContributorAccountingRecord[] } => {
  const groups = new Map<string, Array<{ asset: RawAsset; user: SimulatorUser; auth: ListingAuthorization }>>();

  for (const item of authorized) {
    const key = `${item.asset.data_type}:${item.auth.region}:${item.auth.epoch}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  const shards: DatasetShard[] = [];
  const accounting: ContributorAccountingRecord[] = [];
  const authorizations = authorized.map((item) => item.auth);

  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [dataType, region, epoch] = key.split(":");
    const shardId = `${dataType}__${region}__${epoch}`;
    const sortedGroup = group.sort((a, b) => a.user.user_id.localeCompare(b.user.user_id));
    const records = sortedGroup
      .map(({ asset, user, auth }, index): ContributorAccountingRecord => ({
        shard_id: shardId,
        user_id: user.user_id,
        user_address: user.sui_address,
        role: user.role,
        data_type: asset.data_type,
        region,
        epoch,
        asset_id: asset.asset_id,
        event_count: asset.events?.length ?? 0,
        share_ppm: sharePpmFor(index, group.length),
        claimable_micro_usdc: 0,
        authorization_signature: auth.signature,
      }));

    const contributorManifests = sortedGroup.map(({ asset, user, auth }) => ({
      shard_id: shardId,
      user_id: user.user_id,
      user_address: user.sui_address,
      role: user.role,
      data_type: asset.data_type,
      asset_id: asset.asset_id,
      event_count: asset.events?.length ?? 0,
      authorization_signature: auth.signature,
    }));
    const authorizationRecords = sortedGroup.map((item) => item.auth);
    const shardContent = {
      shard_id: shardId,
      dataset_collection_id: `${dataType}__${region}`,
      data_type: dataType,
      region,
      epoch,
      authorization_scope: AUTH_SCOPE,
      assets: sortedGroup.map((item) => item.asset),
    };
    const shardContentHash = sha256Hex(shardContent);
    const contributorRoot = deterministicPlaceholderRoot(contributorManifests);
    const authorizationRoot = deterministicPlaceholderRoot(authorizationRecords);
    const accountingRoot = deterministicPlaceholderRoot(records);
    const totalEvents = sortedGroup.reduce((sum, item) => sum + (item.asset.events?.length ?? 0), 0);

    accounting.push(...records);
    shards.push({
      shard_id: shardId,
      dataset_collection_id: `${dataType}__${region}`,
      data_type: dataType,
      region,
      epoch,
      generated_at: new Date().toISOString(),
      authorization_scope: AUTH_SCOPE,
      shard_content_hash: shardContentHash,
      contributor_root: contributorRoot,
      authorization_root: authorizationRoot,
      accounting_root: accountingRoot,
      total_contributors: sortedGroup.length,
      total_events: totalEvents,
      contributor_count: sortedGroup.length,
      asset_count: sortedGroup.length,
      event_count: totalEvents,
      assets: sortedGroup.map((item) => item.asset),
    });
  }

  return { shards, authorizations, accounting };
};

export const uploadDatasets = async (): Promise<UploadManifestRecord[]> => {
  const authorized = await loadAuthorizedAssets();
  const built = buildShards(authorized);
  const shards = config.maxUploads ? built.shards.slice(0, config.maxUploads) : built.shards;
  const selectedShardIds = new Set(shards.map((shard) => shard.shard_id));
  const accounting = built.accounting.filter((record) => selectedShardIds.has(record.shard_id));
  const authorizations = built.authorizations.filter((auth) =>
    selectedShardIds.has(`${auth.data_type}__${auth.region}__${auth.epoch}`),
  );

  await rm(config.outputDir, { recursive: true, force: true });
  await mkdir(config.encryptedDir, { recursive: true });
  await mkdir(path.join(config.outputDir, "shards"), { recursive: true });

  const WALRUS_CONCURRENCY = 5;

  const uploadResults = await concurrentMap(shards, WALRUS_CONCURRENCY, async (shard) => {
    const plaintext = Buffer.from(JSON.stringify(shard, null, 2), "utf8");
    const compressed = gzipSync(plaintext);
    const encrypted = encryptBytes(compressed);
    const encryptedPath = path.join(config.encryptedDir, `${shard.shard_id}.json.gz.enc`);
    const shardPath = path.join(config.outputDir, "shards", `${shard.shard_id}.json`);

    await writeJson(shardPath, shard);
    await writeFile(encryptedPath, encrypted.ciphertext);
    const { blobId } = await uploadEncryptedBlob(encrypted.ciphertext);
    if (!blobId.trim()) {
      throw new Error(`Walrus returned empty blob_id for ${shard.shard_id}`);
    }

    const manifestRecord: UploadManifestRecord = {
      shard_id: shard.shard_id,
      dataset_collection_id: shard.dataset_collection_id,
      data_type: shard.data_type,
      region: shard.region,
      epoch: shard.epoch,
      blob_id: blobId,
      shard_content_hash: shard.shard_content_hash,
      contributor_root: shard.contributor_root,
      authorization_root: shard.authorization_root,
      accounting_root: shard.accounting_root,
      total_contributors: shard.total_contributors,
      total_events: shard.total_events,
      contributor_count: shard.contributor_count,
      asset_count: shard.asset_count,
      event_count: shard.event_count,
      contributors: [],
      compression: "gzip",
      encryption: {
        algorithm: ENCRYPTION_ALGORITHM,
        key_ref: `seal_registered_shard_key:${shard.shard_id}`,
        iv: encrypted.iv.toString("hex"),
        auth_tag: encrypted.authTag.toString("hex"),
      },
      walrus: {
        network: "testnet",
        uploaded_at: new Date().toISOString(),
      },
    };

    console.log(`${shard.shard_id} uploaded shard: ${blobId}`);
    return { manifestRecord, aesKey: encrypted.key };
  });

  const uploadLog = uploadResults.map((r) => r.manifestRecord);
  const pendingSealRegistrations: RegisterUploadedDatasetInput[] = uploadResults.map((r) => ({
    manifest: r.manifestRecord,
    aesKey: r.aesKey,
  }));

  const { dataAssets, sealedKeys } =
    await registerUploadedDatasetsOnSuiAndSeal(pendingSealRegistrations);

  await writeFile(
    path.join(config.outputDir, "upload_log.jsonl"),
    `${uploadLog.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );
  await writeJson(path.join(config.outputDir, "upload_manifest.json"), uploadLog);
  await writeJson(path.join(config.outputDir, "listing_authorizations.json"), authorizations);
  await writeJson(path.join(config.outputDir, "contributor_accounting.json"), accounting);
  await mkdir(config.contractsOutputDir, { recursive: true });
  await writeJson(path.join(config.contractsOutputDir, "data_asset_registry.json"), dataAssets);
  await mkdir(config.sealAccessOutputDir, { recursive: true });
  await writeJson(path.join(config.sealAccessOutputDir, "seal_key_registry.json"), sealedKeys);

  console.log(`Authorized contributors: ${authorizations.length}`);
  console.log(`Contributor accounting records: ${accounting.length}`);
  console.log(`Dataset shards uploaded: ${uploadLog.length}`);

  return uploadLog;
};
