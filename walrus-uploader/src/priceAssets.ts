import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { config, projectRoot } from "./config.js";

type DataAssetRegistryRecord = {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
};

type PricingAssetRecord = {
  asset_id: string;
  owner_id: string;
  data_type: string;
  quality_score: number;
  price_micro_usdc: number;
};

type PricingReport = {
  model_version: string;
  generated_at: string;
  assets: PricingAssetRecord[];
};

type ApplyReceipt = {
  applied_at: string;
  model_version: string;
  applied: Array<{
    user_id: string;
    data_asset_id: string;
    data_type: string;
    quality_score: number;
    price_micro_usdc: number;
  }>;
};

const pricingReportPath = path.resolve(
  projectRoot,
  process.env.PRICING_REPORT_PATH ?? "ai-pricing/output/pricing_report.json",
);
const applyReceiptPath = path.resolve(
  projectRoot,
  process.env.PRICING_APPLY_RECEIPT_PATH ?? "ai-pricing/output/pricing_apply_receipt.json",
);

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const requireObjectId = (value: string | undefined, label: string): string => {
  if (!value?.startsWith("0x")) {
    throw new Error(`${label} is required`);
  }
  return value;
};

const parsePublishedPackageId = async (): Promise<string> => {
  const envId = process.env.SUI_PACKAGE_ID ?? process.env.PACKAGE_ID ?? config.sealPackageId;
  if (envId?.startsWith("0x")) {
    return envId;
  }

  const toml = await readFile(config.marsPackageTomlPath, "utf8");
  const section = toml.match(/\[published\.testnet\]([\s\S]*?)(?:\n\[|$)/)?.[1];
  const packageId = section?.match(/published-at\s*=\s*"([^"]+)"/)?.[1];
  if (!packageId?.startsWith("0x")) {
    throw new Error(
      "SUI_PACKAGE_ID/PACKAGE_ID is unset and contracts/mars/Published.toml has no published.testnet package id",
    );
  }
  return packageId;
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

const signerFromPrivateKey = (privateKey: string): Ed25519Keypair => {
  const decoded = decodeSuiPrivateKey(privateKey);
  if (decoded.scheme !== "ED25519") {
    throw new Error(`Only ED25519 Sui private keys are supported, got ${decoded.scheme}`);
  }
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
};

const loadSigner = async (): Promise<Ed25519Keypair> => {
  if (config.suiPrivateKey) {
    return signerFromPrivateKey(config.suiPrivateKey);
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

const validatePricingRecord = (record: PricingAssetRecord): void => {
  if (!record.owner_id?.trim()) {
    throw new Error(`Pricing record ${record.asset_id} is missing owner_id`);
  }
  if (!Number.isInteger(record.quality_score) || record.quality_score < 0 || record.quality_score > 100) {
    throw new Error(`${record.asset_id} quality_score must be an integer from 0 to 100`);
  }
  if (!Number.isInteger(record.price_micro_usdc) || record.price_micro_usdc <= 0) {
    throw new Error(`${record.asset_id} price_micro_usdc must be a positive integer`);
  }
};

const pricingByUserAndType = (report: PricingReport): Map<string, PricingAssetRecord> => {
  const byKey = new Map<string, PricingAssetRecord>();
  for (const record of report.assets) {
    validatePricingRecord(record);
    const key = `${record.owner_id}:${record.data_type}`;
    if (byKey.has(key)) {
      throw new Error(`Duplicate pricing record for ${key}`);
    }
    byKey.set(key, record);
  }
  return byKey;
};

const main = async (): Promise<void> => {
  const adminCapId = requireObjectId(process.env.ADMIN_CAP_ID, "ADMIN_CAP_ID");
  const packageId = await parsePublishedPackageId();
  const signer = await loadSigner();
  const client = new SuiGrpcClient({ network: "testnet", baseUrl: config.suiRpcUrl });

  const registry = await readJson<DataAssetRegistryRecord[]>(
    path.join(config.contractsOutputDir, "data_asset_registry.json"),
  );
  const report = await readJson<PricingReport>(pricingReportPath);
  const priceByKey = pricingByUserAndType(report);

  const maxApplications = process.env.MAX_PRICE_APPLICATIONS
    ? Number.parseInt(process.env.MAX_PRICE_APPLICATIONS, 10)
    : undefined;
  const selected = maxApplications ? registry.slice(0, maxApplications) : registry;

  const applied: ApplyReceipt["applied"] = [];

  for (const asset of selected) {
    const pricing = priceByKey.get(`${asset.user_id}:${asset.data_type}`);
    if (!pricing) {
      throw new Error(`No pricing record for ${asset.user_id}:${asset.data_type}`);
    }

    const tx = new Transaction();
    tx.moveCall({
      target: `${packageId}::data_asset::set_quality_and_price`,
      arguments: [
        tx.object(adminCapId),
        tx.object(asset.data_asset_id),
        tx.pure.u64(pricing.quality_score),
        tx.pure.u64(pricing.price_micro_usdc),
      ],
    });

    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      include: {
        effects: true,
      },
    });
    const transaction = result.Transaction ?? result.FailedTransaction;
    if (!transaction?.status?.success) {
      throw new Error(
        `set_quality_and_price failed for ${asset.user_id}: ${JSON.stringify(
          transaction?.status?.error ?? result,
        )}`,
      );
    }

    applied.push({
      user_id: asset.user_id,
      data_asset_id: asset.data_asset_id,
      data_type: asset.data_type,
      quality_score: pricing.quality_score,
      price_micro_usdc: pricing.price_micro_usdc,
    });
    console.log(
      `${asset.user_id} ${asset.data_type}: quality=${pricing.quality_score} price=${pricing.price_micro_usdc}`,
    );
  }

  const receipt: ApplyReceipt = {
    applied_at: new Date().toISOString(),
    model_version: report.model_version,
    applied,
  };
  await mkdir(path.dirname(applyReceiptPath), { recursive: true });
  await writeFile(applyReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, "utf8");
  console.log(`Applied pricing to ${applied.length} DataAsset(s).`);
  console.log(`Receipt: ${path.relative(projectRoot, applyReceiptPath)}`);
};

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
