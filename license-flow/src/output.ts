import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ContributorEarnings, DataLicense, ListedAsset, RewardDistribution } from "./types";

export const OUTPUT_DIR = path.resolve(process.cwd(), "output");

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

export const resetOutputDir = async (): Promise<void> => {
  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(OUTPUT_DIR, { recursive: true });
};

export const writeFlowOutputs = async (params: {
  listings: ListedAsset[];
  licenses: DataLicense[];
  distributions: RewardDistribution[];
  earnings: ContributorEarnings;
}): Promise<void> => {
  await writeJson(path.join(OUTPUT_DIR, "listings.json"), params.listings);
  await writeJson(path.join(OUTPUT_DIR, "data_licenses.json"), params.licenses);
  await writeJson(path.join(OUTPUT_DIR, "reward_distributions.json"), params.distributions);
  await writeJson(path.join(OUTPUT_DIR, "contributor_earnings.json"), params.earnings);
};
