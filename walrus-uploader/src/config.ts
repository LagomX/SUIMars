import dotenv from "dotenv";
import path from "node:path";

export const moduleRoot = path.resolve(__dirname, "..");
export const projectRoot = path.resolve(moduleRoot, "..");

dotenv.config({ path: path.join(moduleRoot, ".env") });

const boolFromEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }

  if (value !== "true" && value !== "false") {
    throw new Error(`Expected boolean env value "true" or "false", got "${value}"`);
  }

  return value === "true";
};

const positiveIntFromEnv = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer env value, got "${value}"`);
  }

  return parsed;
};

const resolveFromProjectRoot = (value: string | undefined, fallback: string): string =>
  path.resolve(projectRoot, value ?? fallback);

export const config = {
  usersPath: resolveFromProjectRoot(process.env.USERS_PATH, "simulator/users/all_users.json"),
  rawAssetsDir: resolveFromProjectRoot(process.env.RAW_ASSETS_DIR, "simulator/output/raw_assets"),
  outputDir: path.join(moduleRoot, "output"),
  encryptedDir: path.join(moduleRoot, "output", "encrypted"),
  contractsOutputDir: path.join(projectRoot, "contracts", "output"),
  sealAccessOutputDir: path.join(projectRoot, "seal-access", "output"),
  marsPackageTomlPath: path.join(projectRoot, "contracts", "mars", "Published.toml"),
  mockWalrus: boolFromEnv(process.env.MOCK_WALRUS, false),
  walrusCliPath: process.env.WALRUS_CLI_PATH ?? "walrus",
  walrusContext: process.env.WALRUS_CONTEXT ?? "testnet",
  walrusEpochs: positiveIntFromEnv(process.env.WALRUS_EPOCHS, 2),
  walrusConfigPath: process.env.WALRUS_CONFIG_PATH,
  maxUploads: process.env.MAX_UPLOADS ? positiveIntFromEnv(process.env.MAX_UPLOADS, 0) : undefined,
  suiRpcUrl: process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",
  suiPrivateKey: process.env.SUI_PRIVATE_KEY,
  sealPackageId: process.env.SEAL_PACKAGE_ID,
  sealThreshold: positiveIntFromEnv(process.env.SEAL_THRESHOLD, 1),
  sealKeyServerObjectId:
    process.env.SEAL_KEY_SERVER_OBJECT_ID ??
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  sealAggregatorUrl:
    process.env.SEAL_AGGREGATOR_URL ??
    "https://seal-aggregator-testnet.mystenlabs.com",
  sealVerifyKeyServers: boolFromEnv(process.env.SEAL_VERIFY_KEY_SERVERS, false),
};
