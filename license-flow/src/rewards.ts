import { distributeRewards, summarizeEarnings } from "./mock-chain";
import type { ContributorEarnings, ListedAsset, Purchase, RewardDistribution } from "./types";

export const runRewardDistribution = (
  listings: ListedAsset[],
  purchases: Purchase[],
): { listings: ListedAsset[]; distributions: RewardDistribution[] } => distributeRewards(listings, purchases);

export const buildContributorEarnings = (distributions: RewardDistribution[]): ContributorEarnings =>
  summarizeEarnings(distributions);
