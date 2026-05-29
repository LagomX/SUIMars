import { decryptDatasetWithSealAccess } from "./decryptDataset.js";
import { batchDecryptAssets } from "./batchDecrypt.js";

type Command = "decrypt";

type CliOptions = {
  command: Command;
  userId?: string;
  walrusOutputDir?: string;
  help: boolean;
};

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const opts: CliOptions = {
    command: "decrypt",
    help: false,
  };

  const start = args[0] === "decrypt" ? 1 : 0;
  for (let i = start; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case "--help":
      case "-h":
        opts.help = true;
        break;
      case "--user-id":
        opts.userId = args[++i];
        break;
      case "--walrus-output":
        opts.walrusOutputDir = args[++i];
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
};

const printUsage = (): void => {
  console.log(`
Mars Seal Access — real Seal testnet key registration and release.

Usage:
  pnpm decrypt
  pnpm decrypt -- --user-id consumer_001

Inputs:
  contracts/output/data_asset_registry.json
  contracts/output/data_license_registry.json
  walrus-uploader/output/upload_manifest.json
  seal-access/output/seal_key_registry.json

Outputs:
  ../aggregator/output/buyer_workspace/decrypted_assets/
  ../aggregator/output/buyer_workspace/decryption_manifest.json

Single-shard debug mode with --user-id writes:
  output/decrypted_dataset.json
  output/seal_access_receipt.json

Note:
  Seal key registration now happens inside walrus-uploader while the AES key is
  still in memory. By default this command decrypts every shard with a matching
  DataLicense, which is the collection-level marketplace path.
`);
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  if (args.help) {
    printUsage();
    return;
  }

  if (!args.userId) {
    const entries = await batchDecryptAssets();
    const totalAssets = entries.reduce((sum, entry) => sum + entry.asset_count, 0);
    const byType = new Map<string, number>();
    for (const entry of entries) {
      byType.set(entry.data_type, (byType.get(entry.data_type) ?? 0) + entry.asset_count);
    }

    console.log("\nSeal collection access result");
    console.log(`DataShard blobs decrypted : ${entries.length}`);
    console.log(`Individual assets written : ${totalAssets}`);
    for (const [dataType, count] of [...byType.entries()].sort()) {
      console.log(`  ${dataType}: ${count}`);
    }
    return;
  }

  const receipt = await decryptDatasetWithSealAccess({
    userId: args.userId,
    walrusOutputDir: args.walrusOutputDir,
  });

  console.log("\nSeal single-shard access result");
  console.log(`Buyer          : ${receipt.buyer}`);
  console.log(`DataAsset ID   : ${receipt.data_asset_id}`);
  console.log(`DataLicense ID : ${receipt.data_license_id ?? "(none)"}`);
  console.log(`Access granted : ${receipt.access_granted}`);
  console.log(`Reason         : ${receipt.reason}`);
  if (receipt.decrypted_output_path) {
    console.log(`Output         : ${receipt.decrypted_output_path}`);
  }
};

main().catch((error: unknown) => {
  console.error(`\n[error] ${(error as Error).message}`);
  process.exit(1);
});
