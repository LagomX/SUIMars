import { decryptDatasetWithSealAccess } from "./decryptDataset.js";

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
  pnpm decrypt [-- --user-id consumer_001]

Inputs:
  contracts/output/data_asset_registry.json
  contracts/output/data_license_registry.json
  walrus-uploader/output/upload_manifest.json
  seal-access/output/seal_key_registry.json

Outputs:
  output/decrypted_dataset.json
  output/seal_access_receipt.json

Note:
  Seal key registration now happens inside walrus-uploader while the AES key is
  still in memory. seal-access only consumes output/seal_key_registry.json.
`);
};

const main = async (): Promise<void> => {
  const args = parseArgs();
  if (args.help) {
    printUsage();
    return;
  }

  const receipt = await decryptDatasetWithSealAccess({
    userId: args.userId,
    walrusOutputDir: args.walrusOutputDir,
  });

  console.log("\nSeal access result");
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
