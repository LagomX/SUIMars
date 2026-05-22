import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { bcs } from "@mysten/sui/bcs";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { config } from "./config";
import type {
  ContributorInput,
  RegisterDataAssetParams,
  RegistrationRecord,
  SuiRegistrationResult,
} from "./types";

export const textBytes = (value: string): number[] => [...Buffer.from(value, "utf8")];

const validateContributors = (contributors: ContributorInput[]): void => {
  const total = contributors.reduce((sum, contributor) => sum + contributor.weight_bps, 0);
  if (total !== 10_000) {
    throw new Error(`Contributor weights must sum to 10000, got ${total}`);
  }
};

const readJsonArray = async <T>(filePath: string): Promise<T[]> => {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const writeMockRegistration = async (
  params: RegisterDataAssetParams,
  result: SuiRegistrationResult,
): Promise<void> => {
  const outputFile = path.join(config.outputDir, "registrations.json");
  await mkdir(config.outputDir, { recursive: true });
  const records = await readJsonArray<RegistrationRecord>(outputFile);
  records.push({
    asset_id: params.assetId,
    package_id: params.packageId,
    blob_id: params.blobId,
    contributors: params.contributors,
    data_type: params.dataType,
    tx_digest: result.txDigest,
    sui_object_id: result.dataAssetObjectId,
    sui_object_version: result.dataAssetObjectVersion,
    sui_object_digest: result.dataAssetObjectDigest,
    created_at: Date.now(),
  });
  await writeFile(outputFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
};

export const signerFromPrivateKey = (): Ed25519Keypair => {
  if (!config.suiPrivateKey) {
    throw new Error("SUI_PRIVATE_KEY is required when SUI_MOCK=false");
  }
  const decoded = decodeSuiPrivateKey(config.suiPrivateKey);
  if (decoded.schema !== "ED25519") {
    throw new Error(`Only ED25519 private keys are supported by this MVP, got ${decoded.schema}`);
  }
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
};

export const suiClient = (): SuiClient => new SuiClient({ url: getFullnodeUrl(config.suiNetwork) });

export const buildRegisterTransaction = (params: RegisterDataAssetParams): Transaction => {
  if (!config.packageId) {
    throw new Error("PACKAGE_ID is required when SUI_MOCK=false");
  }

  for (const contributor of params.contributors) {
    if (!contributor.address) {
      throw new Error(
        `Missing Sui address for ${contributor.role}. Add contributor address env vars or use SUI_MOCK=true.`,
      );
    }
  }

  const tx = new Transaction();
  const contributorObjects = params.contributors.map((contributor) =>
    tx.moveCall({
      target: `${config.packageId}::data_asset::new_contributor`,
      arguments: [
        tx.pure.address(contributor.address as string),
        tx.pure.vector("u8", textBytes(contributor.role)),
        tx.pure.u64(contributor.weight_bps),
      ],
    }),
  );

  const contributorsVec = tx.makeMoveVec({
    type: `${config.packageId}::data_asset::Contributor`,
    elements: contributorObjects,
  });

  tx.moveCall({
    target: `${config.packageId}::data_asset::register_data_asset`,
    arguments: [
      tx.pure(bcs.vector(bcs.U8).serialize(textBytes(params.blobId))),
      contributorsVec,
      tx.pure.vector("u8", textBytes(params.dataType)),
      tx.object.clock(),
    ],
  });

  return tx;
};

const findCreatedDataAsset = (
  objectChanges: unknown,
): Pick<SuiRegistrationResult, "dataAssetObjectId" | "dataAssetObjectVersion" | "dataAssetObjectDigest"> => {
  if (!Array.isArray(objectChanges)) {
    return {};
  }

  const objectType = `${config.packageId}::data_asset::DataAsset`;
  const created = objectChanges.find((change) => {
    const record = change as { type?: unknown; objectType?: unknown };
    return record.type === "created" && record.objectType === objectType;
  }) as { objectId?: string; version?: string; digest?: string } | undefined;

  return {
    dataAssetObjectId: created?.objectId,
    dataAssetObjectVersion: created?.version,
    dataAssetObjectDigest: created?.digest,
  };
};

export const executeSuiTransaction = async (transaction: Transaction) => {
  const client = suiClient();
  const signer = signerFromPrivateKey();

  const result = await client.signAndExecuteTransaction({
    signer,
    transaction,
    options: {
      showEffects: true,
      showEvents: true,
      showObjectChanges: true,
      showBalanceChanges: true,
    },
  });

  if (result.effects?.status.status !== "success") {
    throw new Error(`Sui transaction failed: ${result.effects?.status.error ?? "unknown error"}`);
  }

  return result;
};

export const registerDataAssetOnSui = async (
  params: RegisterDataAssetParams,
): Promise<SuiRegistrationResult> => {
  validateContributors(params.contributors);

  if (config.suiMock) {
    const result = {
      txDigest: `mock_tx_${params.assetId}_${params.blobId.slice(0, 16)}`,
      dataAssetObjectId: `mock_object_${params.assetId}`,
    };
    await writeMockRegistration(params, result);
    return result;
  }

  // The current Move API requires vector<Contributor>. This wrapper constructs
  // contributors through data_asset::new_contributor, but real mode still needs
  // Sui addresses for rider/merchant/consumer aggregate identities. If the app
  // wants to pass business IDs directly later, add a simpler Move entry such as:
  // register_data_asset_simple(blob_id, rider_addr, merchant_addr, consumer_addr, data_type).
  const transaction = buildRegisterTransaction(params);
  const result = await executeSuiTransaction(transaction);
  const dataAssetObject = findCreatedDataAsset(result.objectChanges);
  const registrationResult = { txDigest: result.digest, ...dataAssetObject };
  await writeMockRegistration(params, registrationResult);
  return registrationResult;
};
