import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";
import { loadSigner, parsePublishedPackageId, signerFromPrivateKey } from "./suiUtils";

dotenv.config({ path: path.join(__dirname, ".env") });

type DataAssetRegistryRecord = {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
};

type SimulatorUser = {
  user_id: string;
  role: string;
  sui_address: string;
  private_key: string;
};

type LicenseRegistryRecord = {
  user_id: string;
  data_asset_id: string;
  data_license_id: string;
  buyer: string;
  data_type: string;
};

const contractsRoot = __dirname;
const projectRoot = path.resolve(contractsRoot, "..");

const config = {
  network: process.env.SUI_NETWORK ?? "testnet",
  usdcTreasuryCapId: process.env.USDC_TREASURY_CAP_ID,
  registryPath: path.resolve(contractsRoot, "output", "data_asset_registry.json"),
  pricingReportPath: path.resolve(projectRoot, "ai-pricing/output/pricing_report.json"),
  outputPath: path.resolve(contractsRoot, "output", "data_license_registry.json"),
  usersPath: path.resolve(projectRoot, "simulator/users/all_users.json"),
  buyerPrivateKey: process.env.BUYER_PRIVATE_KEY,
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const requireObjectId = (value: string | undefined, label: string): string => {
  if (!value?.startsWith("0x")) {
    throw new Error(`${label} is required`);
  }
  return value;
};

type PricingReport = {
  assets: Array<{
    owner_id: string;
    data_type: string;
    quality_score: number;
    price_micro_usdc: number;
  }>;
};

const selectPricing = (
  report: PricingReport,
  assetRecord: DataAssetRegistryRecord,
): { quality_score: number; price_micro_usdc: number } => {
  const pricing = report.assets.find(
    (record) => record.owner_id === assetRecord.user_id && record.data_type === assetRecord.data_type,
  );
  if (!pricing) {
    throw new Error(`No pricing report record for ${assetRecord.user_id}:${assetRecord.data_type}`);
  }
  if (!Number.isInteger(pricing.price_micro_usdc) || pricing.price_micro_usdc <= 0) {
    throw new Error(`Invalid price_micro_usdc for ${assetRecord.user_id}:${assetRecord.data_type}`);
  }
  return pricing;
};

const findCreatedObjectId = (objectChanges: unknown, objectTypeSuffix: string): string => {
  if (!Array.isArray(objectChanges)) {
    throw new Error("Sui transaction result did not include object changes");
  }

  const created = objectChanges.find((change) => {
    const record = change as { type?: unknown; objectType?: unknown };
    return (
      record.type === "created" &&
      typeof record.objectType === "string" &&
      record.objectType.endsWith(objectTypeSuffix)
    );
  }) as { objectId?: string } | undefined;

  if (!created?.objectId?.startsWith("0x")) {
    throw new Error(`Could not find created object of type ${objectTypeSuffix}`);
  }
  return created.objectId;
};

const execute = async (
  client: SuiClient,
  signer: Ed25519Keypair,
  transaction: Transaction,
): Promise<{ objectChanges?: unknown[] | null }> => {
  const result = await client.signAndExecuteTransaction({
    signer,
    transaction,
    options: {
      showEffects: true,
      showObjectChanges: true,
    },
  });

  if (result.effects?.status.status !== "success") {
    throw new Error(result.effects?.status.error ?? "Sui transaction failed");
  }

  return result;
};

const ensureGas = async (
  client: SuiClient,
  funder: Ed25519Keypair,
  recipient: string,
): Promise<void> => {
  const balance = await client.getBalance({ owner: recipient });
  if (BigInt(balance.totalBalance) > 50_000_000n) {
    return;
  }

  const tx = new Transaction();
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(100_000_000n)]);
  tx.transferObjects([coin], tx.pure.address(recipient));
  await execute(client, funder, tx);
  console.log(`Funded ${recipient} with testnet SUI for listing gas`);
};

const main = async (): Promise<void> => {
  const packageId = await parsePublishedPackageId(contractsRoot);
  const treasuryCapId = requireObjectId(config.usdcTreasuryCapId, "USDC_TREASURY_CAP_ID");

  // Only processes the first DataAsset — sufficient for MVP demo where one asset is uploaded.
  const [assetRecord] = await readJson<DataAssetRegistryRecord[]>(config.registryPath);
  if (!assetRecord) {
    throw new Error(`No DataAsset registry records found in ${config.registryPath}`);
  }

  const users = await readJson<SimulatorUser[]>(config.usersPath);
  const pricing = selectPricing(await readJson<PricingReport>(config.pricingReportPath), assetRecord);
  const priceRaw = BigInt(pricing.price_micro_usdc);
  const ownerUser = users.find((user) => user.user_id === assetRecord.user_id);
  if (!ownerUser?.private_key) {
    throw new Error(`Could not find simulator private key for ${assetRecord.user_id}`);
  }

  const client = new SuiClient({ url: getFullnodeUrl(config.network as "testnet") });
  const adminBuyer = await loadSigner(config.buyerPrivateKey);
  const ownerSigner = signerFromPrivateKey(ownerUser.private_key);
  const buyerAddress = adminBuyer.getPublicKey().toSuiAddress();

  await ensureGas(client, adminBuyer, ownerSigner.getPublicKey().toSuiAddress());

  console.log(
    `Using AI pricing for ${assetRecord.user_id}: quality=${pricing.quality_score}, price=${priceRaw.toString()} micro USDC`,
  );

  const listTx = new Transaction();
  listTx.moveCall({
    target: `${packageId}::data_asset::set_for_sale`,
    arguments: [
      listTx.object(assetRecord.data_asset_id),
      listTx.pure.bool(true),
    ],
  });
  await execute(client, ownerSigner, listTx);
  console.log(`Listed DataAsset ${assetRecord.data_asset_id}`);

  const purchaseTx = new Transaction();
  const payment = purchaseTx.moveCall({
    target: `${packageId}::usdc::mint_for_testing`,
    arguments: [
      purchaseTx.object(treasuryCapId),
      purchaseTx.pure.u64(priceRaw),
    ],
  });
  purchaseTx.moveCall({
    target: `${packageId}::data_license::purchase_access`,
    arguments: [
      purchaseTx.object(assetRecord.data_asset_id),
      payment,
      purchaseTx.object.clock(),
    ],
  });
  const purchaseResult = await execute(client, adminBuyer, purchaseTx);
  const licenseId = findCreatedObjectId(
    purchaseResult.objectChanges,
    "::data_license::DataLicense",
  );

  const registry: LicenseRegistryRecord[] = [
    {
      user_id: assetRecord.user_id,
      data_asset_id: assetRecord.data_asset_id,
      data_license_id: licenseId,
      buyer: buyerAddress,
      data_type: assetRecord.data_type,
    },
  ];

  await mkdir(path.dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Purchased DataLicense ${licenseId} for buyer ${buyerAddress}`);
  console.log(`Wrote ${config.outputPath}`);
};

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
