import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const moduleRoot = path.resolve(__dirname, "..");
export const projectRoot = path.resolve(moduleRoot, "..");

// Load .env from the module root (seal-access/.env).
dotenv.config({ path: path.join(moduleRoot, ".env") });

const boolFromEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  if (value !== "true" && value !== "false") {
    throw new Error(`Expected boolean env value "true" or "false", got "${value}"`);
  }
  return value === "true";
};

export const config = {
  // ── Directories ────────────────────────────────────────────────────────────
  outputDir: path.join(moduleRoot, "output"),
  walrusOutputDir: path.join(projectRoot, "walrus-uploader", "output"),
  contractsOutputDir: path.join(projectRoot, "contracts", "output"),
  simulatorUsersPath: path.join(projectRoot, "simulator", "users", "all_users.json"),

  // ── Real Seal / Sui settings ──────────────────────────────────────────────
  suiRpcUrl: process.env.SUI_RPC_URL ?? "https://fullnode.testnet.sui.io:443",

  /**
   * Deployed Mars Move package ID on Sui testnet.
   * If unset (undefined or empty), seal-access reads contracts/mars/Published.toml.
   */
  sealPackageId: process.env.SEAL_PACKAGE_ID ?? undefined,

  sealThreshold: Number.parseInt(process.env.SEAL_THRESHOLD ?? "1", 10),

  /** Official Seal testnet decentralized committee server. */
  sealKeyServerObjectId:
    process.env.SEAL_KEY_SERVER_OBJECT_ID ??
    "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  sealAggregatorUrl:
    process.env.SEAL_AGGREGATOR_URL ??
    "https://seal-aggregator-testnet.mystenlabs.com",
  sealVerifyKeyServers: boolFromEnv(process.env.SEAL_VERIFY_KEY_SERVERS, false),

  /**
   * Optional buyer private key. If unset, the active Sui CLI wallet is used.
   * NEVER use a mainnet wallet here.
   */
  buyerPrivateKey: process.env.BUYER_PRIVATE_KEY ?? "",

  walrusAggregatorUrl:
    process.env.WALRUS_AGGREGATOR_URL ??
    "https://aggregator.walrus-testnet.walrus.space",
};
