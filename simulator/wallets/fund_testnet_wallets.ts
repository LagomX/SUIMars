import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type GeneratedUser = {
  user_id: string;
  sui_address: string;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIMULATOR_DIR = path.resolve(__dirname, "..");
const USERS_PATH = path.join(SIMULATOR_DIR, "users", "all_users.json");

const loadUsers = async (): Promise<GeneratedUser[]> =>
  JSON.parse(await readFile(USERS_PATH, "utf8")) as GeneratedUser[];

const main = async (): Promise<void> => {
  if (process.env.FUND_TESTNET_WALLETS !== "true") {
    console.log("Faucet funding is disabled by default.");
    console.log("Set FUND_TESTNET_WALLETS=true to request testnet SUI for generated users.");
    return;
  }

  const faucetModule = await import("@mysten/sui/faucet");
  const requestSuiFromFaucetV2 = (faucetModule as Record<string, unknown>).requestSuiFromFaucetV2;
  const getFaucetHost = (faucetModule as Record<string, unknown>).getFaucetHost;

  if (typeof requestSuiFromFaucetV2 !== "function" || typeof getFaucetHost !== "function") {
    console.log("Sui faucet helpers are not available in this SDK version.");
    console.log("TODO: update this script to the current @mysten/sui faucet API.");
    process.exitCode = 1;
    return;
  }

  const users = await loadUsers();
  const limit = Number.parseInt(process.env.FAUCET_LIMIT ?? "10", 10);
  const recipients = users.slice(0, Math.max(0, limit));
  const host = getFaucetHost("testnet") as string;

  for (const user of recipients) {
    await requestSuiFromFaucetV2({
      host,
      recipient: user.sui_address,
    });
    console.log(`Requested testnet SUI for ${user.user_id}: ${user.sui_address}`);
  }
};

main().catch((error) => {
  console.error("Faucet funding failed gracefully.");
  console.error(error);
  process.exit(1);
});
