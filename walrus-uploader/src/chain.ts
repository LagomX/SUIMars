import dotenv from "dotenv";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { coinWithBalance, Transaction } from "@mysten/sui/transactions";
import { config } from "./config";
import { executeSuiTransaction, signerFromPrivateKey } from "./sui";
import type { RegistrationRecord } from "./types";

dotenv.config();

type ChainCommand =
  | "mint-usdc"
  | "price-assets"
  | "list-assets"
  | "prepare-assets"
  | "purchase-sample"
  | "distribute-rewards"
  | "run-sample";

type ChainTxRecord = {
  asset_id?: string;
  sui_object_id?: string;
  data_type?: string;
  tx_digest: string;
  created_at: number;
};

type AssetPriceRecord = ChainTxRecord & {
  quality_score: number;
  price_usdc: string;
  price_raw: string;
};

type AssetListingRecord = ChainTxRecord & {
  for_sale: true;
};

type PurchaseRecord = ChainTxRecord & {
  buyer_address: string;
  price_usdc: string;
  price_raw: string;
  license_object_id?: string;
  license_object_version?: string;
  license_object_digest?: string;
};

type MintRecord = {
  recipient: string;
  amount_usdc: string;
  amount_raw: string;
  tx_digest: string;
  coin_object_ids: string[];
  created_at: number;
};

const OUTPUT_DIR = path.join(config.outputDir, "testnet");
const REGISTRATIONS_FILE = path.join(config.outputDir, "registrations.json");

const DEFAULT_PRICES_USDC: Record<string, string> = {
  rider_mobility: process.env.RIDER_MOBILITY_PRICE_USDC ?? "3",
  merchant_operations: process.env.MERCHANT_OPERATIONS_PRICE_USDC ?? "2",
  consumer_behavior: process.env.CONSUMER_BEHAVIOR_PRICE_USDC ?? "1",
};

const DEFAULT_QUALITY_SCORES: Record<string, number> = {
  rider_mobility: Number.parseInt(process.env.RIDER_MOBILITY_QUALITY_SCORE ?? "90", 10),
  merchant_operations: Number.parseInt(process.env.MERCHANT_OPERATIONS_QUALITY_SCORE ?? "86", 10),
  consumer_behavior: Number.parseInt(process.env.CONSUMER_BEHAVIOR_QUALITY_SCORE ?? "82", 10),
};

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const readJsonArray = async <T>(filePath: string): Promise<T[]> => {
  try {
    return await readJson<T[]>(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
};

const appendRecord = async <T>(fileName: string, record: T): Promise<void> => {
  const filePath = path.join(OUTPUT_DIR, fileName);
  const records = await readJsonArray<T>(filePath);
  records.push(record);
  await writeJson(filePath, records);
};

const requireConfig = (value: string, name: string): string => {
  if (!value.trim()) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const normalizeAddress = (value: string | undefined): string => (value ?? "").toLowerCase();

const assertObjectId = (value: string | undefined, label: string): string => {
  if (!value?.startsWith("0x")) {
    throw new Error(`${label} is missing a real Sui object id. Run upload:testnet first.`);
  }
  return value;
};

const usdcType = (): string => `${requireConfig(config.packageId, "PACKAGE_ID")}::usdc::USDC`;

const parseUsdcToRaw = (amount: string, decimals: number): bigint => {
  const normalized = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`Invalid USDC amount: ${amount}`);
  }

  const [whole, fractional = ""] = normalized.split(".");
  if (fractional.length > decimals) {
    throw new Error(`USDC amount ${amount} has more than ${decimals} decimals`);
  }

  const paddedFractional = fractional.padEnd(decimals, "0");
  return BigInt(`${whole}${paddedFractional}`.replace(/^0+(?=\d)/, ""));
};

const formatRawUsdc = (raw: bigint, decimals: number): string => {
  const value = raw.toString().padStart(decimals + 1, "0");
  const whole = value.slice(0, -decimals);
  const fractional = value.slice(-decimals).replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole;
};

const priceForDataType = (dataType: string): { display: string; raw: bigint } => {
  const display = DEFAULT_PRICES_USDC[dataType];
  if (!display) {
    throw new Error(`No default price configured for data type: ${dataType}`);
  }
  return { display, raw: parseUsdcToRaw(display, config.usdcDecimals) };
};

const qualityForDataType = (dataType: string): number => {
  const score = DEFAULT_QUALITY_SCORES[dataType] ?? Number.parseInt(process.env.DEFAULT_QUALITY_SCORE ?? "80", 10);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    throw new Error(`Invalid quality score for ${dataType}: ${score}`);
  }
  return score;
};

const selectRegistrations = async (): Promise<RegistrationRecord[]> => {
  const registrations = await readJson<RegistrationRecord[]>(REGISTRATIONS_FILE);
  const assetId = process.env.ASSET_ID;
  const selected = assetId
    ? registrations.filter((registration) => registration.asset_id === assetId)
    : registrations;

  const limit = process.env.CHAIN_MAX_ASSETS ? Number.parseInt(process.env.CHAIN_MAX_ASSETS, 10) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error(`Invalid CHAIN_MAX_ASSETS: ${process.env.CHAIN_MAX_ASSETS}`);
  }

  return limit ? selected.slice(0, limit) : selected;
};

const signerAddress = (): string => signerFromPrivateKey().getPublicKey().toSuiAddress();

const findCreatedObjects = (
  objectChanges: unknown,
  objectType: string,
): { objectId?: string; version?: string; digest?: string }[] => {
  if (!Array.isArray(objectChanges)) {
    return [];
  }

  return objectChanges
    .filter((change) => {
      const record = change as { type?: unknown; objectType?: unknown };
      return record.type === "created" && record.objectType === objectType;
    })
    .map((change) => {
      const record = change as { objectId?: string; version?: string; digest?: string };
      return {
        objectId: record.objectId,
        version: record.version,
        digest: record.digest,
      };
    });
};

const mintUsdc = async (): Promise<void> => {
  const treasuryCapId = requireConfig(config.usdcTreasuryCapId, "USDC_TREASURY_CAP_ID");
  const recipient = process.env.USDC_MINT_RECIPIENT ?? signerAddress();
  const displayAmount = process.env.USDC_MINT_AMOUNT ?? "100";
  const rawAmount = parseUsdcToRaw(displayAmount, config.usdcDecimals);

  const tx = new Transaction();
  const mintedCoin = tx.moveCall({
    target: `${config.packageId}::usdc::mint_for_testing`,
    arguments: [tx.object(treasuryCapId), tx.pure.u64(rawAmount)],
  });
  tx.transferObjects([mintedCoin], tx.pure.address(recipient));

  const result = await executeSuiTransaction(tx);
  const coinObjects = findCreatedObjects(result.objectChanges, `0x2::coin::Coin<${usdcType()}>`);
  const record: MintRecord = {
    recipient,
    amount_usdc: formatRawUsdc(rawAmount, config.usdcDecimals),
    amount_raw: rawAmount.toString(),
    tx_digest: result.digest,
    coin_object_ids: coinObjects.flatMap((object) => (object.objectId ? [object.objectId] : [])),
    created_at: Date.now(),
  };
  await appendRecord("mint_usdc.json", record);
  console.log(`Minted ${record.amount_usdc} USDC to ${recipient}: ${result.digest}`);
};

const priceAssets = async (): Promise<AssetPriceRecord[]> => {
  requireConfig(config.adminCapId, "ADMIN_CAP_ID");
  const registrations = await selectRegistrations();
  const records: AssetPriceRecord[] = [];

  for (const registration of registrations) {
    const objectId = assertObjectId(registration.sui_object_id, registration.asset_id);
    const { display, raw } = priceForDataType(registration.data_type);
    const quality = qualityForDataType(registration.data_type);

    const tx = new Transaction();
    tx.moveCall({
      target: `${config.packageId}::data_asset::set_quality_and_price`,
      arguments: [
        tx.object(config.adminCapId),
        tx.object(objectId),
        tx.pure.u64(quality),
        tx.pure.u64(raw),
      ],
    });

    const result = await executeSuiTransaction(tx);
    const record: AssetPriceRecord = {
      asset_id: registration.asset_id,
      sui_object_id: objectId,
      data_type: registration.data_type,
      quality_score: quality,
      price_usdc: display,
      price_raw: raw.toString(),
      tx_digest: result.digest,
      created_at: Date.now(),
    };
    await appendRecord("asset_prices.json", record);
    records.push(record);
    console.log(`Priced ${registration.asset_id} at ${display} USDC: ${result.digest}`);
  }

  return records;
};

const listAssets = async (): Promise<AssetListingRecord[]> => {
  const registrations = await selectRegistrations();
  const sender = normalizeAddress(signerAddress());
  const records: AssetListingRecord[] = [];

  for (const registration of registrations) {
    const contributor = registration.contributors[0];
    if (normalizeAddress(contributor.address) !== sender) {
      throw new Error(
        `${registration.asset_id} contributor is ${contributor.address ?? "missing"}, but signer is ${sender}. ` +
          "Run this command with the contributor wallet that owns the asset.",
      );
    }

    const objectId = assertObjectId(registration.sui_object_id, registration.asset_id);
    const tx = new Transaction();
    tx.moveCall({
      target: `${config.packageId}::data_asset::set_for_sale`,
      arguments: [tx.object(objectId), tx.pure.bool(true)],
    });

    const result = await executeSuiTransaction(tx);
    const record: AssetListingRecord = {
      asset_id: registration.asset_id,
      sui_object_id: objectId,
      data_type: registration.data_type,
      for_sale: true,
      tx_digest: result.digest,
      created_at: Date.now(),
    };
    await appendRecord("asset_listings.json", record);
    records.push(record);
    console.log(`Listed ${registration.asset_id}: ${result.digest}`);
  }

  return records;
};

const purchaseSample = async (): Promise<PurchaseRecord[]> => {
  const registrations = await selectRegistrations();
  const buyer = signerAddress();
  const records: PurchaseRecord[] = [];

  for (const registration of registrations) {
    const objectId = assertObjectId(registration.sui_object_id, registration.asset_id);
    const { display, raw } = priceForDataType(registration.data_type);

    const tx = new Transaction();
    const payment = tx.add(
      coinWithBalance({
        type: usdcType(),
        balance: raw,
      }),
    );
    tx.moveCall({
      target: `${config.packageId}::data_license::purchase_access`,
      arguments: [tx.object(objectId), payment, tx.object.clock()],
    });

    const result = await executeSuiTransaction(tx);
    const [licenseObject] = findCreatedObjects(result.objectChanges, `${config.packageId}::data_license::DataLicense`);
    const record: PurchaseRecord = {
      asset_id: registration.asset_id,
      sui_object_id: objectId,
      data_type: registration.data_type,
      buyer_address: buyer,
      price_usdc: display,
      price_raw: raw.toString(),
      license_object_id: licenseObject?.objectId,
      license_object_version: licenseObject?.version,
      license_object_digest: licenseObject?.digest,
      tx_digest: result.digest,
      created_at: Date.now(),
    };
    await appendRecord("purchases.json", record);
    records.push(record);
    console.log(`Purchased ${registration.asset_id} for ${display} USDC: ${result.digest}`);
  }

  return records;
};

const distributeRewards = async (): Promise<ChainTxRecord[]> => {
  const purchases = await readJsonArray<PurchaseRecord>(path.join(OUTPUT_DIR, "purchases.json"));
  if (purchases.length === 0) {
    throw new Error("No purchase records found. Run purchase-sample first.");
  }

  const byAsset = new Map<string, PurchaseRecord>();
  for (const purchase of purchases) {
    if (purchase.asset_id && !byAsset.has(purchase.asset_id)) {
      byAsset.set(purchase.asset_id, purchase);
    }
  }

  const records: ChainTxRecord[] = [];
  for (const purchase of byAsset.values()) {
    const objectId = assertObjectId(purchase.sui_object_id, purchase.asset_id ?? "asset");
    const tx = new Transaction();
    tx.moveCall({
      target: `${config.packageId}::data_asset::distribute_reward`,
      arguments: [tx.object(objectId)],
    });

    const result = await executeSuiTransaction(tx);
    const record: ChainTxRecord = {
      asset_id: purchase.asset_id,
      sui_object_id: objectId,
      data_type: purchase.data_type,
      tx_digest: result.digest,
      created_at: Date.now(),
    };
    await appendRecord("reward_distributions.json", record);
    records.push(record);
    console.log(`Distributed rewards for ${purchase.asset_id}: ${result.digest}`);
  }

  return records;
};

const runSample = async (): Promise<void> => {
  await mintUsdc();
  await priceAssets();
  await listAssets();
  await purchaseSample();
  await distributeRewards();
};

const main = async (): Promise<void> => {
  const command = process.argv[2] as ChainCommand | undefined;
  switch (command) {
    case "mint-usdc":
      await mintUsdc();
      return;
    case "price-assets":
      await priceAssets();
      return;
    case "list-assets":
      await listAssets();
      return;
    case "prepare-assets":
      await priceAssets();
      await listAssets();
      return;
    case "purchase-sample":
      await purchaseSample();
      return;
    case "distribute-rewards":
      await distributeRewards();
      return;
    case "run-sample":
      await runSample();
      return;
    default:
      throw new Error(
        "Usage: ts-node src/chain.ts " +
          "mint-usdc|price-assets|list-assets|prepare-assets|purchase-sample|distribute-rewards|run-sample",
      );
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
