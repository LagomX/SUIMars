declare const require: <T = unknown>(path: string) => T;

export type UserRole = 'rider' | 'merchant' | 'consumer';
export type DataType = 'rider_mobility' | 'merchant_operations' | 'consumer_behavior';

type UploadResult = {
  asset_id: string;
  package_id: string;
  contributor_id: string;
  blob_id: string;
  data_type: DataType | string;
};

type Listing = {
  asset_id: string;
  package_id: string;
  blob_id: string;
  data_type: DataType | string;
  for_sale: boolean;
  price_usdc: number;
  contributor: {
    participant_id: string;
    role: UserRole | string;
    weight_bps: number;
  };
};

type DataLicense = {
  license_id: string;
  buyer_id: string;
  asset_id: string;
  data_type: DataType | string;
  usdc_paid: number;
  purchased_at: number;
  license_type: 'perpetual';
};

type RewardDistribution = {
  asset_id: string;
  contributor_id: string;
  role: UserRole | string;
  amount_usdc: number;
  distributed_at: number;
};

type ContributorEarnings = {
  contributors: Record<
    string,
    {
      contributor_id: string;
      role: UserRole | string;
      total_usdc: number;
      licenses_sold: number;
    }
  >;
  roles: Record<string, { total_usdc: number; licenses_sold: number }>;
};

type AccessResult = {
  buyer_id: string;
  asset_id: string;
  license_id: string;
  blob_id: string;
  access_granted: true;
  decrypted_successfully: true;
  data_type: DataType | string;
  order_count: number;
  verified_at: number;
};

type RejectedAccessAttempt = {
  buyer_id: string;
  asset_id: string;
  reason: string;
  rejected: true;
};

export type DashboardAsset = {
  asset_id: string;
  data_type: DataType;
  blob_id: string;
  for_sale: boolean;
  price_usdc: number;
  license_count: number;
  total_earned_usdc: number;
  access_grant_count: number;
};

export type DashboardLicense = DataLicense;

export type DataDashboardModel = {
  assets: DashboardAsset[];
  licenses: DashboardLicense[];
  total_assets: number;
  licenses_sold: number;
  total_earned_usdc: number;
  access_grants: number;
  rejected_access_attempts: number;
  role_earnings_usdc: number;
  role_licenses_sold: number;
};

const emptyArray = <T>() => [] as T[];

const safeRequire = <T>(loader: () => T, fallback: T): T => {
  try {
    return loader();
  } catch {
    return fallback;
  }
};

const uploadResults = safeRequire(
  () => require<UploadResult[]>('../../walrus-uploader/output/upload_results.json'),
  emptyArray<UploadResult>(),
);
const listings = safeRequire(
  () => require<Listing[]>('../../license-flow/output/listings.json'),
  emptyArray<Listing>(),
);
const licenses = safeRequire(
  () => require<DataLicense[]>('../../license-flow/output/data_licenses.json'),
  emptyArray<DataLicense>(),
);
const rewards = safeRequire(
  () => require<RewardDistribution[]>('../../license-flow/output/reward_distributions.json'),
  emptyArray<RewardDistribution>(),
);
const earnings = safeRequire(
  () => require<ContributorEarnings>('../../license-flow/output/contributor_earnings.json'),
  { contributors: {}, roles: {} },
);
const accessResults = emptyArray<AccessResult>();
const rejectedAccessAttempts = emptyArray<RejectedAccessAttempt>();

const roleDataType: Record<UserRole, DataType> = {
  rider: 'rider_mobility',
  merchant: 'merchant_operations',
  consumer: 'consumer_behavior',
};

const isKnownDataType = (value: string): value is DataType =>
  value === 'rider_mobility' ||
  value === 'merchant_operations' ||
  value === 'consumer_behavior';

const matchesOwner = (listing: Listing, role: UserRole, userId: string) => {
  if (listing.contributor.role !== role || listing.contributor.weight_bps !== 10000) {
    return false;
  }

  if (listing.contributor.participant_id === userId) {
    return true;
  }

  return role === 'consumer' && listing.contributor.participant_id.endsWith('_consumer_group');
};

export function getDataDashboard(role: UserRole, userId: string): DataDashboardModel {
  const expectedDataType = roleDataType[role];
  const ownedListings = listings.filter(
    (listing) =>
      listing.data_type === expectedDataType &&
      matchesOwner(listing, role, userId),
  );
  const ownedAssetIds = new Set(ownedListings.map((asset) => asset.asset_id));
  const ownedLicenses = licenses.filter((license) => ownedAssetIds.has(license.asset_id));
  const ownedRewards = rewards.filter((reward) => ownedAssetIds.has(reward.asset_id));
  const ownedAccessResults = accessResults.filter((access) => ownedAssetIds.has(access.asset_id));

  const assets = ownedListings
    .map((listing): DashboardAsset | null => {
      if (!isKnownDataType(listing.data_type)) {
        return null;
      }
      const upload = uploadResults.find((result) => result.asset_id === listing.asset_id);
      const assetLicenses = ownedLicenses.filter((license) => license.asset_id === listing.asset_id);
      const assetRewards = ownedRewards.filter((reward) => reward.asset_id === listing.asset_id);
      const assetAccess = ownedAccessResults.filter((access) => access.asset_id === listing.asset_id);

      return {
        asset_id: listing.asset_id,
        data_type: listing.data_type,
        blob_id: upload?.blob_id ?? listing.blob_id,
        for_sale: listing.for_sale,
        price_usdc: listing.price_usdc,
        license_count: assetLicenses.length,
        total_earned_usdc: assetRewards.reduce((sum, reward) => sum + reward.amount_usdc, 0),
        access_grant_count: assetAccess.length,
      };
    })
    .filter((asset): asset is DashboardAsset => asset !== null);

  const contributorIds = new Set(ownedListings.map((asset) => asset.contributor.participant_id));
  const totalEarned = ownedRewards.reduce((sum, reward) => sum + reward.amount_usdc, 0);
  const directEarnings = [...contributorIds].reduce(
    (sum, contributorId) => sum + (earnings.contributors[contributorId]?.total_usdc ?? 0),
    0,
  );
  const roleEarnings = earnings.roles[role]?.total_usdc ?? 0;
  const roleLicenseSales = earnings.roles[role]?.licenses_sold ?? 0;

  return {
    assets,
    licenses: ownedLicenses
      .slice()
      .sort((a, b) => b.purchased_at - a.purchased_at)
      .slice(0, 8),
    total_assets: assets.length,
    licenses_sold: ownedLicenses.length,
    total_earned_usdc: totalEarned || directEarnings,
    access_grants: ownedAccessResults.length,
    rejected_access_attempts: rejectedAccessAttempts.length,
    role_earnings_usdc: roleEarnings,
    role_licenses_sold: roleLicenseSales,
  };
}
