import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";

type Role = "rider" | "merchant" | "consumer";

type GeneratedUser = {
  user_id: string;
  role: Role;
  sui_address: string;
  private_key: string;
  wallet_type: "generated_ed25519_testnet";
  network: "sui_testnet";
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIMULATOR_DIR = path.resolve(__dirname, "..");
const USERS_DIR = path.join(SIMULATOR_DIR, "users");

const DEFAULT_COUNTS: Record<Role, number> = {
  rider: 100,
  merchant: 40,
  consumer: 500,
};

const countFor = (role: Role): number => {
  const envName = `MARS_${role.toUpperCase()}_COUNT`;
  const value = process.env[envName];
  if (!value) {
    return DEFAULT_COUNTS[role];
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${envName} must be a positive integer`);
  }
  return parsed;
};

const generateUsers = (role: Role, count: number): GeneratedUser[] =>
  Array.from({ length: count }, (_, index) => {
    const keypair = new Ed25519Keypair();
    return {
      user_id: `${role}_${String(index + 1).padStart(3, "0")}`,
      role,
      sui_address: keypair.getPublicKey().toSuiAddress(),
      private_key: keypair.getSecretKey(),
      wallet_type: "generated_ed25519_testnet",
      network: "sui_testnet",
    };
  });

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const main = async (): Promise<void> => {
  await mkdir(USERS_DIR, { recursive: true });

  const riders = generateUsers("rider", countFor("rider"));
  const merchants = generateUsers("merchant", countFor("merchant"));
  const consumers = generateUsers("consumer", countFor("consumer"));
  const allUsers = [...riders, ...merchants, ...consumers];

  await writeJson(path.join(USERS_DIR, "riders.json"), riders);
  await writeJson(path.join(USERS_DIR, "merchants.json"), merchants);
  await writeJson(path.join(USERS_DIR, "consumers.json"), consumers);
  await writeJson(path.join(USERS_DIR, "all_users.json"), allUsers);

  console.log("Generated Sui testnet-compatible Ed25519 users");
  console.log(`Riders: ${riders.length}`);
  console.log(`Merchants: ${merchants.length}`);
  console.log(`Consumers: ${consumers.length}`);
  console.log(`Output: ${USERS_DIR}`);
  console.log("WARNING: generated private keys are for testnet/hackathon use only.");
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
