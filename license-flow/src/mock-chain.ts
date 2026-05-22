import { v5 as uuidv5 } from "uuid";
import type {
  ContributorEarnings,
  DataLicense,
  DataType,
  FlowState,
  ListedAsset,
  Purchase,
  RegistrationRecord,
  RewardDistribution,
} from "./types";

const UUID_NAMESPACE = "adc594d1-0a84-4572-bf9b-f4a88fd6bb58";
const BUYERS = ["ai_company_01", "ai_company_02", "ai_company_03"] as const;
const BASE_TIMESTAMP = Date.UTC(2026, 4, 21, 12, 0, 0);

const PRICES: Record<DataType, number> = {
  rider_mobility: 3,
  merchant_operations: 2,
  consumer_behavior: 1,
};

class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }
}

const roundUsdc = (value: number): number => Math.round(value * 100) / 100;

export const listAssetsForSale = (registrations: RegistrationRecord[]): ListedAsset[] =>
  registrations.map((registration, index) => {
    if (registration.contributors.length !== 1) {
      throw new Error(`${registration.asset_id} must have exactly one contributor in MVP`);
    }

    const contributor = registration.contributors[0];
    if (contributor.weight_bps !== 10_000) {
      throw new Error(`${registration.asset_id} contributor weight must be 10000`);
    }

    return {
      asset_id: registration.asset_id,
      package_id: registration.package_id,
      blob_id: registration.blob_id,
      data_type: registration.data_type,
      for_sale: true,
      price_usdc: PRICES[registration.data_type],
      contributor,
      reward_pool_usdc: 0,
      listed_at: BASE_TIMESTAMP + index * 1000,
    };
  });

export const simulatePurchases = (listings: ListedAsset[], seed = 20260521): Purchase[] => {
  const rng = new SeededRandom(seed);
  const purchases: Purchase[] = [];

  listings.forEach((asset, index) => {
    if (!asset.for_sale) {
      return;
    }

    const purchaseCount = 1 + (rng.next() > 0.7 ? 1 : 0);
    for (let repeat = 0; repeat < purchaseCount; repeat += 1) {
      const buyerId = BUYERS[(index + repeat) % BUYERS.length];
      const purchaseIndex = purchases.length + 1;
      const purchasedAt = BASE_TIMESTAMP + purchaseIndex * 60_000;

      purchases.push({
        purchase_id: `purchase_${String(purchaseIndex).padStart(3, "0")}`,
        buyer_id: buyerId,
        asset_id: asset.asset_id,
        data_type: asset.data_type,
        usdc_paid: asset.price_usdc,
        purchased_at: purchasedAt,
      });
    }
  });

  return purchases;
};

export const mintLicenses = (purchases: Purchase[]): DataLicense[] =>
  purchases.map((purchase) => ({
    license_id: `license_${uuidv5(purchase.purchase_id, UUID_NAMESPACE)}`,
    buyer_id: purchase.buyer_id,
    asset_id: purchase.asset_id,
    data_type: purchase.data_type,
    usdc_paid: purchase.usdc_paid,
    purchased_at: purchase.purchased_at,
    license_type: "perpetual",
  }));

export const distributeRewards = (
  listings: ListedAsset[],
  purchases: Purchase[],
): { listings: ListedAsset[]; distributions: RewardDistribution[] } => {
  const listedById = new Map(listings.map((listing) => [listing.asset_id, { ...listing }]));

  for (const purchase of purchases) {
    const asset = listedById.get(purchase.asset_id);
    if (!asset) {
      throw new Error(`Purchase references unknown asset: ${purchase.asset_id}`);
    }
    if (!asset.for_sale) {
      throw new Error(`Purchase occurred on non-listed asset: ${purchase.asset_id}`);
    }
    asset.reward_pool_usdc = roundUsdc(asset.reward_pool_usdc + purchase.usdc_paid);
  }

  const distributions: RewardDistribution[] = [];
  for (const asset of listedById.values()) {
    if (asset.reward_pool_usdc < 0) {
      throw new Error(`Negative reward pool for ${asset.asset_id}`);
    }
    if (asset.reward_pool_usdc === 0) {
      continue;
    }

    distributions.push({
      asset_id: asset.asset_id,
      contributor_id: asset.contributor.participant_id,
      role: asset.contributor.role,
      amount_usdc: roundUsdc(asset.reward_pool_usdc),
      distributed_at: BASE_TIMESTAMP + 24 * 60 * 60 * 1000,
    });
    asset.reward_pool_usdc = 0;
  }

  return { listings: [...listedById.values()], distributions };
};

export const summarizeEarnings = (distributions: RewardDistribution[]): ContributorEarnings => {
  const earnings: ContributorEarnings = {
    contributors: {},
    roles: {
      rider: { total_usdc: 0, licenses_sold: 0 },
      merchant: { total_usdc: 0, licenses_sold: 0 },
      consumer: { total_usdc: 0, licenses_sold: 0 },
    },
  };

  for (const distribution of distributions) {
    const contributor = (earnings.contributors[distribution.contributor_id] ??= {
      contributor_id: distribution.contributor_id,
      role: distribution.role,
      total_usdc: 0,
      licenses_sold: 0,
    });

    contributor.total_usdc = roundUsdc(contributor.total_usdc + distribution.amount_usdc);
    contributor.licenses_sold += 1;
    earnings.roles[distribution.role].total_usdc = roundUsdc(
      earnings.roles[distribution.role].total_usdc + distribution.amount_usdc,
    );
    earnings.roles[distribution.role].licenses_sold += 1;
  }

  return earnings;
};

export const validateFlow = (state: FlowState): void => {
  const validAssets = new Set(state.listings.map((listing) => listing.asset_id));
  const listedAssets = new Set(state.listings.filter((listing) => listing.for_sale).map((listing) => listing.asset_id));
  const paymentTotal = roundUsdc(state.purchases.reduce((sum, purchase) => sum + purchase.usdc_paid, 0));
  const distributedTotal = roundUsdc(
    state.distributions.reduce((sum, distribution) => sum + distribution.amount_usdc, 0),
  );

  for (const purchase of state.purchases) {
    if (!listedAssets.has(purchase.asset_id)) {
      throw new Error(`Purchase on non-listed asset: ${purchase.asset_id}`);
    }
  }

  for (const license of state.licenses) {
    if (!validAssets.has(license.asset_id)) {
      throw new Error(`License references invalid asset: ${license.asset_id}`);
    }
  }

  for (const listing of state.listings) {
    if (listing.reward_pool_usdc < 0) {
      throw new Error(`Negative reward pool: ${listing.asset_id}`);
    }
  }

  if (paymentTotal !== distributedTotal) {
    throw new Error(`Payments (${paymentTotal}) do not match distributions (${distributedTotal})`);
  }
};
