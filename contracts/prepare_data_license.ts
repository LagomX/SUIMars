import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import dotenv from "dotenv";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

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

const projectRoot = path.resolve(__dirname, "..");
const contractsRoot = __dirname;

const config = {
  network: process.env.SUI_NETWORK ?? "testnet",
  packageId: process.env.PACKAGE_ID,
  adminCapId: process.env.ADMIN_CAP_ID,
  usdcTreasuryCapId: process.env.USDC_TREASURY_CAP_ID,
  priceRaw: BigInt(process.env.DATA_LICENSE_PRICE_RAW ?? "1000000"),
  registryPath: path.resolve(contractsRoot, "output", "data_asset_registry.json"),
  outputPath: path.resolve(contractsRoot, "output", "data_license_registry.json"),
  usersPath: path.resolve(projectRoot, "simulator/users/all_users.json"),
  buyerPrivateKey: process.env.BUYER_PRIVATE_KEY,
};

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const parsePublishedPackageId = async (): Promise<string> => {
  if (config.packageId?.startsWith("0x")) {
    return config.packageId;
  }

  const publishedToml = await readFile(path.join(contractsRoot, "mars", "Published.toml"), "utf8");
  const packageMatch = publishedToml
    .match(/\[published\.testnet\]([\s\S]*?)(?:\n\[|$)/)?.[1]
    ?.match(/published-at\s*=\s*"([^"]+)"/);
  const packageId = packageMatch?.[1];
  if (!packageId?.startsWith("0x")) {
    throw new Error("PACKAGE_ID is not set and Published.toml has no testnet package id");
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
  if (decoded.schema !== "ED25519") {
    throw new Error(`Only ED25519 private keys are supported by this script, got ${decoded.schema}`);
  }
  return Ed25519Keypair.fromSecretKey(decoded.secretKey);
};

const signerFromSuiKeystore = async (): Promise<Ed25519Keypair> => {
  const { activeAddress, keystorePath } = await activeSuiConfig();
  const keys = await readJson<string[]>(keystorePath);

  for (const encoded of keys) {
    const bytes = Buffer.from(encoded, "base64");
    if (bytes[0] !== 0) {
      continue;
    }

    const keypair = Ed25519Keypair.fromSecretKey(bytes.slice(1));
    if (keypair.getPublicKey().toSuiAddress().toLowerCase() === activeAddress) {
      return keypair;
    }
  }

  throw new Error(`Could not find active ED25519 Sui address in ${keystorePath}`);
};

const buyerSigner = async (): Promise<Ed25519Keypair> =>
  config.buyerPrivateKey ? signerFromPrivateKey(config.buyerPrivateKey) : signerFromSuiKeystore();

const requireObjectId = (value: string | undefined, label: string): string => {
  if (!value?.startsWith("0x")) {
    throw new Error(`${label} is required`);
  }
  return value;
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
): Promise<any> => {
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
  const packageId = await parsePublishedPackageId();
  const adminCapId = requireObjectId(config.adminCapId, "ADMIN_CAP_ID");
  const treasuryCapId = requireObjectId(config.usdcTreasuryCapId, "USDC_TREASURY_CAP_ID");
  const [assetRecord] = await readJson<DataAssetRegistryRecord[]>(config.registryPath);
  if (!assetRecord) {
    throw new Error(`No DataAsset registry records found in ${config.registryPath}`);
  }

  const users = await readJson<SimulatorUser[]>(config.usersPath);
  const ownerUser = users.find((user) => user.user_id === assetRecord.user_id);
  if (!ownerUser?.private_key) {
    throw new Error(`Could not find simulator private key for ${assetRecord.user_id}`);
  }

  const client = new SuiClient({ url: getFullnodeUrl(config.network as "testnet") });
  const adminBuyer = await buyerSigner();
  const ownerSigner = signerFromPrivateKey(ownerUser.private_key);
  const buyerAddress = adminBuyer.getPublicKey().toSuiAddress();

  await ensureGas(client, adminBuyer, ownerSigner.getPublicKey().toSuiAddress());

  const priceTx = new Transaction();
  priceTx.moveCall({
    target: `${packageId}::data_asset::set_quality_and_price`,
    arguments: [
      priceTx.object(adminCapId),
      priceTx.object(assetRecord.data_asset_id),
      priceTx.pure.u64(90),
      priceTx.pure.u64(config.priceRaw),
    ],
  });
  await execute(client, adminBuyer, priceTx);
  console.log(`Set DataAsset price to ${config.priceRaw.toString()} raw USDC`);

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
      purchaseTx.pure.u64(config.priceRaw),
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
