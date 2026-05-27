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
  user_id: string;
  owner_addr: string;
  role: string;
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

export type DataAssetRegistryRecord = {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
};

export type SealKeyRegistryRecord = {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
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

const findCreatedDataAssetId = (transaction: TxWithEffectsAndTypes, packageId: string): string => {
  const changedObjects = transaction.effects?.changedObjects;
  const objectTypes = transaction.objectTypes;
  if (!changedObjects || typeof objectTypes !== "object" || objectTypes === null) {
    throw new Error("Sui transaction result did not include effects.changedObjects and objectTypes");
  }

  const expectedTypeSuffix = "::data_asset::DataAsset";
  const created = changedObjects.find((change) => {
    const objectType = change.objectId ? objectTypes[change.objectId] : undefined;
    return (
      change.idOperation === "Created" &&
      typeof objectType === "string" &&
      objectType.startsWith(packageId) &&
      objectType.endsWith(expectedTypeSuffix)
    );
  });

  if (!created?.objectId?.startsWith("0x")) {
    throw new Error("Could not find created DataAsset object");
  }
  return created.objectId;
};

const registerDataAsset = async (
  client: SuiGrpcClient,
  signer: Ed25519Keypair,
  packageId: string,
  manifest: UploadManifestRecord,
): Promise<string> => {
  const tx = new Transaction();
  const contributorObjects = manifest.contributors.map((contributor) =>
    tx.moveCall({
      target: `${packageId}::data_asset::new_contributor`,
      arguments: [
        tx.pure.address(contributor.addr),
        tx.pure.vector("u8", textBytes(contributor.role)),
        tx.pure.u64(contributor.weight_bps),
      ],
    }),
  );

  const contributors = tx.makeMoveVec({
    type: `${packageId}::data_asset::Contributor`,
    elements: contributorObjects,
  });

  tx.moveCall({
    target: `${packageId}::data_asset::register_data_asset`,
    arguments: [
      tx.pure.vector("u8", textBytes(manifest.blob_id)),
      contributors,
      tx.pure.vector("u8", textBytes(manifest.data_type)),
      tx.object.clock(),
    ],
  });

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    include: {
      effects: true,
      objectTypes: true,
    },
  });

  const transaction = result.Transaction ?? result.FailedTransaction;
  if (!transaction?.status?.success) {
    throw new Error(
      `register_data_asset failed for ${manifest.user_id}: ` +
        `${JSON.stringify(transaction?.status?.error ?? result)}`,
    );
  }

  return findCreatedDataAssetId(transaction as TxWithEffectsAndTypes, packageId);
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
    user_id: manifest.user_id,
    blob_id: manifest.blob_id,
    data_asset_id: dataAssetId,
    data_type: manifest.data_type,
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
  const sealedKeys: SealKeyRegistryRecord[] = [];

  for (const input of inputs) {
    const dataAssetId = await registerDataAsset(client, signer, packageIds.publishedAt, input.manifest);
    dataAssets.push({
      user_id: input.manifest.user_id,
      blob_id: input.manifest.blob_id,
      data_asset_id: dataAssetId,
      data_type: input.manifest.data_type,
    });
    console.log(`${input.manifest.user_id} registered DataAsset ${dataAssetId}`);

    const sealedKey = await registerAesKeyWithSeal(
      client,
      packageIds,
      input.manifest,
      dataAssetId,
      input.aesKey,
    );
    sealedKeys.push(sealedKey);
    console.log(`${input.manifest.user_id} registered AES key with Seal`);

    input.aesKey.fill(0);
  }

  return { dataAssets, sealedKeys };
};
