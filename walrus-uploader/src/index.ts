import path from "node:path";
import { config } from "./config.js";
import { uploadDatasets } from "./uploadDataset.js";

const printUsage = (): void => {
  console.log("Usage: pnpm upload");
  console.log("");
  console.log("Environment overrides:");
  console.log("  USERS_PATH=simulator/users/all_users.json");
  console.log("  RAW_ASSETS_DIR=simulator/output/raw_assets");
  console.log("  WALRUS_CLI_PATH=walrus");
  console.log("  WALRUS_CONTEXT=testnet");
  console.log("  WALRUS_EPOCHS=2");
  console.log("  MAX_UPLOADS=1");
  console.log("  SUI_PRIVATE_KEY=<optional testnet key; defaults to active Sui CLI wallet>");
  console.log("  SEAL_THRESHOLD=1");
};

const main = async (): Promise<void> => {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printUsage();
    return;
  }

  const records = await uploadDatasets();
  console.log(`Uploaded ${records.length} encrypted personal dataset blob(s).`);
  console.log(`Upload log: ${path.join(config.outputDir, "upload_log.jsonl")}`);
  console.log(`Manifest: ${path.join(config.outputDir, "upload_manifest.json")}`);
  console.log(`DataAsset registry: ${path.join(config.contractsOutputDir, "data_asset_registry.json")}`);
  console.log(`Seal key registry: ${path.join(config.sealAccessOutputDir, "seal_key_registry.json")}`);
  console.log("Raw AES keys were not written to disk.");
};

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
