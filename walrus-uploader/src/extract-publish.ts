import { readFile } from "node:fs/promises";

type PublishIds = {
  packageId?: string;
  upgradeCapId?: string;
  adminCapId?: string;
  usdcTreasuryCapId?: string;
  usdcMetadataId?: string;
};

const readPublishOutput = async (): Promise<unknown> => {
  const filePath = process.argv[2];
  if (filePath) {
    return JSON.parse(await readFile(filePath, "utf8")) as unknown;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const input = Buffer.concat(chunks).toString("utf8").trim();
  if (!input) {
    throw new Error("Pass a publish JSON file path or pipe JSON into stdin.");
  }
  return JSON.parse(input) as unknown;
};

const objectChanges = (publishOutput: unknown): Record<string, unknown>[] => {
  const record = publishOutput as { objectChanges?: unknown };
  if (!Array.isArray(record.objectChanges)) {
    throw new Error("Publish output does not contain objectChanges. Run `sui client publish --json`.");
  }
  return record.objectChanges as Record<string, unknown>[];
};

const findPackageId = (changes: Record<string, unknown>[]): string | undefined => {
  const published = changes.find((change) => change.type === "published");
  return typeof published?.packageId === "string" ? published.packageId : undefined;
};

const findCreatedObject = (
  changes: Record<string, unknown>[],
  objectType: string,
): string | undefined => {
  const created = changes.find((change) => change.type === "created" && change.objectType === objectType);
  return typeof created?.objectId === "string" ? created.objectId : undefined;
};

const extractIds = (publishOutput: unknown): PublishIds => {
  const changes = objectChanges(publishOutput);
  const packageId = findPackageId(changes);
  if (!packageId) {
    throw new Error("Could not find published PackageID in objectChanges.");
  }

  return {
    packageId,
    upgradeCapId: findCreatedObject(changes, "0x2::package::UpgradeCap"),
    adminCapId: findCreatedObject(changes, `${packageId}::escrow::AdminCap`),
    usdcTreasuryCapId: findCreatedObject(changes, `0x2::coin::TreasuryCap<${packageId}::usdc::USDC>`),
    usdcMetadataId: findCreatedObject(changes, `0x2::coin::CoinMetadata<${packageId}::usdc::USDC>`),
  };
};

const main = async (): Promise<void> => {
  const ids = extractIds(await readPublishOutput());
  console.log(JSON.stringify(ids, null, 2));
  console.log("");
  console.log("Add these to walrus-uploader/.env:");
  console.log(`PACKAGE_ID=${ids.packageId ?? ""}`);
  console.log(`ADMIN_CAP_ID=${ids.adminCapId ?? ""}`);
  console.log(`USDC_TREASURY_CAP_ID=${ids.usdcTreasuryCapId ?? ""}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
