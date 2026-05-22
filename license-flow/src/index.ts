import dotenv from "dotenv";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runBuyerSimulation } from "./buyer";
import { mintDataLicenses } from "./licensing";
import { listAssetsForSale, validateFlow } from "./mock-chain";
import { resetOutputDir, writeFlowOutputs } from "./output";
import { buildContributorEarnings, runRewardDistribution } from "./rewards";
import type { RegistrationRecord } from "./types";

dotenv.config();

const UPLOADER_OUTPUT_DIR = path.resolve(process.cwd(), "../walrus-uploader/output");

const readJson = async <T>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T;

const topEarningContributor = (earnings: ReturnType<typeof buildContributorEarnings>): string => {
  const contributors = Object.values(earnings.contributors);
  if (contributors.length === 0) {
    return "none";
  }
  const top = contributors.sort((a, b) => b.total_usdc - a.total_usdc)[0];
  return `${top.contributor_id} (${top.total_usdc} USDC)`;
};

const main = async (): Promise<void> => {
  const registrations = await readJson<RegistrationRecord[]>(
    path.join(UPLOADER_OUTPUT_DIR, "registrations.json"),
  );

  await resetOutputDir();

  const listedAssets = listAssetsForSale(registrations);
  const purchases = runBuyerSimulation(listedAssets);
  const licenses = mintDataLicenses(purchases);
  const { listings, distributions } = runRewardDistribution(listedAssets, purchases);
  const earnings = buildContributorEarnings(distributions);

  validateFlow({ listings, purchases, licenses, distributions, earnings });
  await writeFlowOutputs({ listings, licenses, distributions, earnings });

  const totalVolume = purchases.reduce((sum, purchase) => sum + purchase.usdc_paid, 0);

  console.log(`Total assets listed: ${listedAssets.length}`);
  console.log(`Total purchases: ${purchases.length}`);
  console.log(`Total licenses minted: ${licenses.length}`);
  console.log(`Total USDC volume: ${totalVolume}`);
  console.log(`Top earning contributor: ${topEarningContributor(earnings)}`);
  console.log("Earnings by role:");
  console.log(`  rider: ${earnings.roles.rider.total_usdc} USDC`);
  console.log(`  merchant: ${earnings.roles.merchant.total_usdc} USDC`);
  console.log(`  consumer: ${earnings.roles.consumer.total_usdc} USDC`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
