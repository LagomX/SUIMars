import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import dotenv from "dotenv";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { loadSigner, parsePublishedPackageId } from "./suiUtils";

dotenv.config({ path: path.join(__dirname, ".env") });

type Role = "rider" | "merchant" | "consumer";

type Contributor = {
  addr: string;
  role: Role;
  weight_bps: number;
};

type UploadManifestRecord = {
  user_id: string;
  blob_id: string;
  data_type: string;
  contributors: Contributor[];
};

type RegistryRecord = {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
};

const projectRoot = path.resolve(__dirname, "..");
const contractsRoot = __dirname;

const config = {
  network: process.env.SUI_NETWORK ?? "testnet",
  packageId: process.env.PACKAGE_ID,
  manifestPath: path.resolve(
    projectRoot,
    process.env.UPLOAD_MANIFEST_PATH ?? "walrus-uploader/output/upload_manifest.json",
  ),
  outputPath: path.resolve(
    contractsRoot,
    process.env.DATA_ASSET_REGISTRY_PATH ?? "output/data_asset_registry.json",
  ),
  maxRegistrations: process.env.MAX_REGISTRATIONS
    ? Number.parseInt(process.env.MAX_REGISTRATIONS, 10)
    : undefined,
};

const textBytes = (value: string): number[] => [...Buffer.from(value, "utf8")];

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;


const validateManifestRecord = (record: UploadManifestRecord): void => {
  if (!record.user_id?.trim()) {
    throw new Error("Manifest record is missing user_id");
  }
  if (!record.blob_id?.trim()) {
    throw new Error(`${record.user_id} is missing blob_id`);
  }
  if (!record.data_type?.trim()) {
    throw new Error(`${record.user_id} is missing data_type`);
  }
  if (!Array.isArray(record.contributors) || record.contributors.length === 0) {
    throw new Error(`${record.user_id} contributors must be a non-empty array`);
  }

  const totalWeight = record.contributors.reduce((sum, contributor) => sum + contributor.weight_bps, 0);
  if (totalWeight !== 10000) {
    throw new Error(`${record.user_id} contributor weights must sum to 10000, got ${totalWeight}`);
  }

  for (const contributor of record.contributors) {
    if (!contributor.addr?.startsWith("0x")) {
      throw new Error(`${record.user_id} contributor address must start with 0x`);
    }
  }
};

const buildRegisterTransaction = (packageId: string, record: UploadManifestRecord): Transaction => {
  const tx = new Transaction();
  const contributorObjects = record.contributors.map((contributor) =>
    tx.moveCall({
      target: `${packageId}::data_asset::new_contributor`,
      arguments: [
        tx.pure.address(contributor.addr),
        tx.pure.vector("u8", textBytes(contributor.role)),
        tx.pure.u64(contributor.weight_bps),
      ],
    }),
  );

  const contributors = tx.makeMoveVec({
    type: `${packageId}::data_asset::Contributor`,
    elements: contributorObjects,
  });

  tx.moveCall({
    target: `${packageId}::data_asset::register_data_asset`,
    arguments: [
      tx.pure.vector("u8", textBytes(record.blob_id)),
      contributors,
      tx.pure.vector("u8", textBytes(record.data_type)),
      tx.object.clock(),
    ],
  });

  return tx;
};

const findCreatedDataAssetId = (objectChanges: unknown, packageId: string): string => {
  if (!Array.isArray(objectChanges)) {
    throw new Error("Sui transaction result did not include object changes");
  }

  const expectedType = `${packageId}::data_asset::DataAsset`;
  const created = objectChanges.find((change) => {
    const record = change as { type?: unknown; objectType?: unknown };
    return record.type === "created" && record.objectType === expectedType;
  }) as { objectId?: string } | undefined;

  if (!created?.objectId?.startsWith("0x")) {
    throw new Error(`Could not find created DataAsset object of type ${expectedType}`);
  }

  return created.objectId;
};

const main = async (): Promise<void> => {
  const packageId = await parsePublishedPackageId(contractsRoot);
  const signer = await loadSigner(process.env.SUI_PRIVATE_KEY);
  const client = new SuiClient({ url: getFullnodeUrl(config.network as "testnet") });
  const manifest = await readJson<UploadManifestRecord[]>(config.manifestPath);
  const selected = config.maxRegistrations ? manifest.slice(0, config.maxRegistrations) : manifest;

  if (selected.length === 0) {
    throw new Error(`No records found in ${config.manifestPath}`);
  }

  const registry: RegistryRecord[] = [];

  for (const record of selected) {
    validateManifestRecord(record);
    const tx = buildRegisterTransaction(packageId, record);
    const result = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status !== "success") {
      throw new Error(`register_data_asset failed for ${record.user_id}: ${result.effects?.status.error}`);
    }

    const dataAssetId = findCreatedDataAssetId(result.objectChanges, packageId);
    registry.push({
      user_id: record.user_id,
      blob_id: record.blob_id,
      data_asset_id: dataAssetId,
      data_type: record.data_type,
    });

    console.log(`${record.user_id} registered DataAsset ${dataAssetId}`);
  }

  await mkdir(path.dirname(config.outputPath), { recursive: true });
  await writeFile(config.outputPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  console.log(`Wrote ${registry.length} registry record(s): ${config.outputPath}`);
};

main().catch((error) => {
  console.error((error as Error).message);
  process.exit(1);
});
