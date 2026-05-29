import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import type { SuiClientTypes } from "@mysten/sui/client";
import { SealClient } from "@mysten/seal";
import { config } from "./config.js";
import type { ENCRYPTION_ALGORITHM } from "./encrypt.js";

type Contributor = {
  addr: string;
  role: string;
  weight_bps: number;
};

export type UploadManifestRecord = {
  shard_id: string;
  dataset_collection_id: string;
  data_type: string;
  region: string;
  epoch: string;
  blob_id: string;
  shard_content_hash: string;
  contributor_root: string;
  authorization_root: string;
  accounting_root: string;
  total_contributors: number;
  total_events: number;
  contributor_count: number;
  asset_count: number;
  event_count: number;
  contributors: Contributor[];
  compression: "gzip";
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

export type DataAssetRegistryRecord = {
  shard_id: string;
  dataset_collection_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
  region: string;
  epoch: string;
  shard_content_hash: string;
  contributor_root: string;
  authorization_root: string;
  accounting_root: string;
  total_contributors: number;
  total_events: number;
  contributor_count: number;
};

export type SealKeyRegistryRecord = {
  shard_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
  region: string;
  epoch: string;
  key_ref: string;
  seal_id: string;
  move_package_id: string;
  package_id: string;
  threshold: number;
  key_servers: Array<{
    object_id: string;
    weight: number;
    aggregator_url?: string;
  }>;
  encrypted_key_b64: string;
  registered_at: string;
};

export type RegisterUploadedDatasetInput = {
  manifest: UploadManifestRecord;
  aesKey: Buffer;
};

type PackageIds = {
  originalId: string;
  publishedAt: string;
};

/** gRPC transaction response with effects and objectTypes included. */
type TxWithEffectsAndTypes = SuiClientTypes.Transaction<{
  effects: true;
  objectTypes: true;
}>;

const BATCH_SIZE = 90;
const SEAL_CONCURRENCY = 20;

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

const textBytes = (value: string): number[] => [...Buffer.from(value, "utf8")];

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const parsePublishedPackageIds = async (): Promise<PackageIds> => {
  if (config.sealPackageId?.startsWith("0x")) {
    return { originalId: config.sealPackageId, publishedAt: config.sealPackageId };
  }

  const publishedToml = await readFile(config.marsPackageTomlPath, "utf8");
  const section = publishedToml.match(/\[published\.testnet\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const publishedAt = section?.match(/published-at\s*=\s*"([^"]+)"/)?.[1];
  const originalId = section?.match(/original-id\s*=\s*"([^"]+)"/)?.[1] ?? publishedAt;

  if (!originalId?.startsWith("0x") || !publishedAt?.startsWith("0x")) {
    throw new Error(
      "SEAL_PACKAGE_ID is unset and contracts/mars/Published.toml has no published.testnet package ids",
    );
  }
  return { originalId, publishedAt };
};

const activeSuiConfig = async (): Promise<{ activeAddress: string; keystorePath: string }> => {
  const clientYamlPath = path.join(os.homedir(), ".sui", "sui_config", "client.yaml");
  const yaml = await readFile(clientYamlPath, "utf8");
  const activeAddress = yaml.match(/active_address:\s*"?([^"\n]+)"?/)?.[1]?.trim();
  const keystorePath =
    yaml.match(/keystore:\s*\n\s*File:\s*([^\n]+)/)?.[1]?.trim() ??
    path.join(os.homedir(), ".sui", "sui_config", "sui.keystore");

  if (!activeAddress?.startsWith("0x")) {
    throw new Error(`Could not find active_address in ${clientYamlPath}`);
  }

  return {
    activeAddress: activeAddress.toLowerCase(),
    keystorePath: keystorePath.replace(/^~/, os.homedir()),
  };
};

const loadSigner = async (): Promise<Ed25519Keypair> => {
  if (config.suiPrivateKey) {
    const decoded = decodeSuiPrivateKey(config.suiPrivateKey);
    if (decoded.scheme !== "ED25519") {
      throw new Error(`Only ED25519 Sui private keys are supported, got ${decoded.scheme}`);
    }
    return Ed25519Keypair.fromSecretKey(decoded.secretKey);
  }

  const { activeAddress, keystorePath } = await activeSuiConfig();
  const keys = await readJson<string[]>(keystorePath);
  for (const encoded of keys) {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes[0] !== 0) {
      continue;
    }
    const keypair = Ed25519Keypair.fromSecretKey(bytes.subarray(1));
    if (keypair.getPublicKey().toSuiAddress().toLowerCase() === activeAddress) {
      return keypair;
    }
  }

  throw new Error(`Could not find active ED25519 Sui key in ${keystorePath}`);
};

const findAllCreatedDataAssetIds = (
  transaction: TxWithEffectsAndTypes,
  packageId: string,
  expectedCount: number,
): string[] => {
  const changedObjects = transaction.effects?.changedObjects;
  const objectTypes = transaction.objectTypes;
  if (!changedObjects || typeof objectTypes !== "object" || objectTypes === null) {
    throw new Error("Sui transaction result did not include effects.changedObjects and objectTypes");
  }

  const expectedTypeSuffix = "::data_asset::DataAsset";
  const created = changedObjects
    .filter((change) => {
      const objectType = change.objectId ? objectTypes[change.objectId] : undefined;
      return (
        change.idOperation === "Created" &&
        typeof objectType === "string" &&
        objectType.startsWith(packageId) &&
        objectType.endsWith(expectedTypeSuffix)
      );
    })
    .map((change) => change.objectId!);

  if (created.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} created DataAssets, found ${created.length}`);
  }
  return created;
};

const registerDataAssetBatch = async (
  client: SuiGrpcClient,
  signer: Ed25519Keypair,
  packageIds: PackageIds,
  manifests: UploadManifestRecord[],
): Promise<string[]> => {
  const tx = new Transaction();

  for (const manifest of manifests) {
    tx.moveCall({
      target: `${packageIds.publishedAt}::data_asset::register_data_shard`,
      arguments: [
        tx.pure.vector("u8", textBytes(manifest.blob_id)),
        tx.pure.vector("u8", textBytes(manifest.data_type)),
        tx.pure.vector("u8", textBytes(manifest.region)),
        tx.pure.vector("u8", textBytes(manifest.epoch)),
        tx.pure.vector("u8", textBytes(manifest.shard_content_hash)),
        tx.pure.vector("u8", textBytes(manifest.contributor_root)),
        tx.pure.vector("u8", textBytes(manifest.authorization_root)),
        tx.pure.vector("u8", textBytes(manifest.accounting_root)),
        tx.pure.u64(manifest.total_contributors),
        tx.pure.u64(manifest.total_events),
        tx.object.clock(),
      ],
    });
  }

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    include: { effects: true, objectTypes: true },
  });

  const transaction = result.Transaction ?? result.FailedTransaction;
  if (!transaction?.status?.success) {
    throw new Error(
      `register_data_shard batch (${manifests.length} shard(s)) failed: ` +
        `${JSON.stringify(transaction?.status?.error ?? result)}`,
    );
  }

  return findAllCreatedDataAssetIds(
    transaction as TxWithEffectsAndTypes,
    packageIds.originalId,
    manifests.length,
  );
};

const sealKeyServerConfigs = () => [
  {
    objectId: config.sealKeyServerObjectId,
    aggregatorUrl: config.sealAggregatorUrl,
    weight: 1,
  },
];

const registerAesKeyWithSeal = async (
  client: SuiGrpcClient,
  packageIds: PackageIds,
  manifest: UploadManifestRecord,
  dataAssetId: string,
  aesKey: Buffer,
): Promise<SealKeyRegistryRecord> => {
  if (aesKey.length !== 32) {
    throw new Error(`AES-256-GCM key must be 32 bytes, got ${aesKey.length}`);
  }

  const sealClient = new SealClient({
    suiClient: client,
    serverConfigs: sealKeyServerConfigs(),
    verifyKeyServers: config.sealVerifyKeyServers,
  });

  const encrypted = await sealClient.encrypt({
    threshold: config.sealThreshold,
    packageId: packageIds.originalId,
    id: dataAssetId,
    data: aesKey,
  });

  return {
    shard_id: manifest.shard_id,
    blob_id: manifest.blob_id,
    data_asset_id: dataAssetId,
    data_type: manifest.data_type,
    region: manifest.region,
    epoch: manifest.epoch,
    key_ref: manifest.encryption.key_ref,
    seal_id: dataAssetId,
    move_package_id: packageIds.publishedAt,
    package_id: packageIds.originalId,
    threshold: config.sealThreshold,
    key_servers: sealKeyServerConfigs().map((server) => ({
      object_id: server.objectId,
      weight: server.weight,
      aggregator_url: server.aggregatorUrl,
    })),
    encrypted_key_b64: Buffer.from(encrypted.encryptedObject).toString("base64"),
    registered_at: new Date().toISOString(),
  };
};

export const registerUploadedDatasetsOnSuiAndSeal = async (
  inputs: RegisterUploadedDatasetInput[],
): Promise<{
  dataAssets: DataAssetRegistryRecord[];
  sealedKeys: SealKeyRegistryRecord[];
}> => {
  const packageIds = await parsePublishedPackageIds();
  const signer = await loadSigner();
  const client = new SuiGrpcClient({
    network: "testnet",
    baseUrl: config.suiRpcUrl,
  });

  const dataAssets: DataAssetRegistryRecord[] = [];
  const dataAssetIds: string[] = [];

  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    const batch = inputs.slice(i, i + BATCH_SIZE);
    const batchIds = await registerDataAssetBatch(
      client,
      signer,
      packageIds,
      batch.map((b) => b.manifest),
    );
    for (let j = 0; j < batch.length; j++) {
      dataAssets.push({
        shard_id: batch[j].manifest.shard_id,
        dataset_collection_id: batch[j].manifest.dataset_collection_id,
        blob_id: batch[j].manifest.blob_id,
        data_asset_id: batchIds[j],
        data_type: batch[j].manifest.data_type,
        region: batch[j].manifest.region,
        epoch: batch[j].manifest.epoch,
        shard_content_hash: batch[j].manifest.shard_content_hash,
        contributor_root: batch[j].manifest.contributor_root,
        authorization_root: batch[j].manifest.authorization_root,
        accounting_root: batch[j].manifest.accounting_root,
        total_contributors: batch[j].manifest.total_contributors,
        total_events: batch[j].manifest.total_events,
        contributor_count: batch[j].manifest.contributor_count,
      });
      dataAssetIds.push(batchIds[j]);
      console.log(`${batch[j].manifest.shard_id} registered DataShard ${batchIds[j]}`);
    }
  }

  const sealedKeys = await concurrentMap(
    inputs.map((input, i) => ({ input, dataAssetId: dataAssetIds[i] })),
    SEAL_CONCURRENCY,
    async ({ input, dataAssetId }) => {
      const sealedKey = await registerAesKeyWithSeal(
        client,
        packageIds,
        input.manifest,
        dataAssetId,
        input.aesKey,
      );
      input.aesKey.fill(0);
      console.log(`${input.manifest.shard_id} registered shard AES key with Seal`);
      return sealedKey;
    },
  );

  return { dataAssets, sealedKeys };
};
