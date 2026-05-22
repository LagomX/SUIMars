import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

export type SuiNetwork = "mainnet" | "testnet" | "devnet" | "localnet";

const boolFromEnv = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === "true";
};

const intFromEnv = (value: string | undefined, defaultValue: number): number => {
  if (value === undefined) {
    return defaultValue;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer env value: ${value}`);
  }
  return parsed;
};

const networkFromEnv = (value: string | undefined): SuiNetwork => {
  const network = value ?? "testnet";
  if (!["mainnet", "testnet", "devnet", "localnet"].includes(network)) {
    throw new Error(`Unsupported SUI_NETWORK: ${network}`);
  }
  return network as SuiNetwork;
};

export const config = {
  suiNetwork: networkFromEnv(process.env.SUI_NETWORK),
  packageId: process.env.PACKAGE_ID ?? "",
  suiMock: boolFromEnv(process.env.SUI_MOCK, true),
  walrusMock: boolFromEnv(process.env.WALRUS_MOCK, true),
  walrusEpochs: intFromEnv(process.env.WALRUS_EPOCHS, 5),
  suiPrivateKey: process.env.SUI_PRIVATE_KEY,
  outputDir: path.resolve(process.cwd(), "output"),
  simulatorPackagesDir: path.resolve(process.cwd(), "../simulator/output/packages"),
  contributorAddresses: {
    rider: process.env.CONTRIBUTOR_RIDER_ADDRESS,
    merchant: process.env.CONTRIBUTOR_MERCHANT_ADDRESS,
    consumer: process.env.CONTRIBUTOR_CONSUMER_ADDRESS,
  },
};
