import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DataType, EncryptedAssetEnvelope, PersonalDataAsset, SimulationResult } from "./types";

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const rawAssetPath = (outputDir: string, asset: PersonalDataAsset): string =>
  path.join(outputDir, "raw_assets", asset.data_type, `${asset.asset_id}.json`);

const encryptedAssetPath = (outputDir: string, asset: EncryptedAssetEnvelope): string =>
  path.join(outputDir, "mock_walrus", "encrypted_assets", asset.data_type, `${asset.asset_id}.json`);

const keyRecords = (assets: EncryptedAssetEnvelope[]): Record<string, string> =>
  Object.fromEntries(assets.map((asset) => [asset.key_id, "mock-local-development-key"]));

const countEventsByType = (assets: PersonalDataAsset[], dataType: DataType): number =>
  assets
    .filter((asset) => asset.data_type === dataType)
    .reduce((sum, asset) => sum + asset.events.length, 0);

export const writeSimulatorOutput = async (
  simulation: SimulationResult,
  outputDir = path.resolve(process.cwd(), "output"),
): Promise<void> => {
  await rm(outputDir, { recursive: true, force: true });

  await writeJson(path.join(outputDir, "orders.json"), simulation.orders);

  for (const asset of simulation.rawAssets) {
    await writeJson(rawAssetPath(outputDir, asset), asset);
  }

  for (const asset of simulation.encryptedAssets) {
    await writeJson(encryptedAssetPath(outputDir, asset), asset);
  }

  await writeJson(path.join(outputDir, "license_manifest.json"), simulation.manifest);
  await writeJson(path.join(outputDir, "mock_walrus", "mock_keys.json"), keyRecords(simulation.encryptedAssets));
  await writeJson(path.join(outputDir, "simulation_summary.json"), {
    ...simulation.summary,
    event_counts: {
      rider_mobility: countEventsByType(simulation.rawAssets, "rider_mobility"),
      merchant_operations: countEventsByType(simulation.rawAssets, "merchant_operations"),
      consumer_demand: countEventsByType(simulation.rawAssets, "consumer_demand"),
    },
  });
};
