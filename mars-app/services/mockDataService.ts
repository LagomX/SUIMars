declare const require: <T = unknown>(path: string) => T;

export type UserRole = 'rider' | 'merchant' | 'consumer';
export type DataType = 'rider_mobility' | 'merchant_operations' | 'consumer_behavior';

type ContributorAccountingRecord = {
  shard_id: string;
  user_id: string;
  user_address: string;
  role: UserRole | string;
  data_type: DataType | string;
  region: string;
  epoch: string;
  asset_id: string;
  event_count: number;
  share_ppm: number;
  claimable_micro_usdc: number;
};

type UploadManifestRecord = {
  shard_id: string;
  blob_id: string;
  data_type: DataType | string;
  region: string;
  epoch: string;
  contributor_count: number;
};

type LicenseRecord = {
  shard_id?: string;
  data_license_id: string;
  data_asset_id: string;
  buyer: string;
  data_type: DataType | string;
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
  share_ppm: number;
  event_count: number;
  region: string;
  epoch: string;
};

export type DashboardLicense = {
  license_id: string;
  buyer_id: string;
  asset_id: string;
  data_type: DataType | string;
  usdc_paid: number;
  purchased_at: number;
  license_type: 'perpetual';
};

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

const accounting = safeRequire(
  () => require<ContributorAccountingRecord[]>('../../walrus-uploader/output/contributor_accounting.json'),
  emptyArray<ContributorAccountingRecord>(),
);
const uploadManifest = safeRequire(
  () => require<UploadManifestRecord[]>('../../walrus-uploader/output/upload_manifest.json'),
  emptyArray<UploadManifestRecord>(),
);
const licenses = safeRequire(
  () => require<LicenseRecord[]>('../../contracts/output/data_license_registry.json'),
  emptyArray<LicenseRecord>(),
);

const roleDataType: Record<UserRole, DataType> = {
  rider: 'rider_mobility',
  merchant: 'merchant_operations',
  consumer: 'consumer_behavior',
};

const isKnownDataType = (value: string): value is DataType =>
  value === 'rider_mobility' ||
  value === 'merchant_operations' ||
  value === 'consumer_behavior';

const canonicalUserId = (role: UserRole, userId: string): string => {
  const match = userId.match(/^(rider|merchant|consumer)_(\d+)$/);
  if (!match) return userId;
  return `${role}_${match[2].padStart(3, '0')}`;
};

export function getDataDashboard(role: UserRole, userId: string): DataDashboardModel {
  const expectedDataType = roleDataType[role];
  const canonicalId = canonicalUserId(role, userId);
  const userAccounting = accounting.filter(
    (record) => record.user_id === canonicalId && record.data_type === expectedDataType,
  );
  const shardIds = new Set(userAccounting.map((record) => record.shard_id));
  const ownedLicenses = licenses.filter((license) => license.shard_id && shardIds.has(license.shard_id));

  const assets = userAccounting
    .map((record): DashboardAsset | null => {
      if (!isKnownDataType(record.data_type)) return null;
      const upload = uploadManifest.find((item) => item.shard_id === record.shard_id);
      const licenseCount = ownedLicenses.filter((license) => license.shard_id === record.shard_id).length;
      return {
        asset_id: record.shard_id,
        data_type: record.data_type,
        blob_id: upload?.blob_id ?? '',
        for_sale: true,
        price_usdc: 0,
        license_count: licenseCount,
        total_earned_usdc: record.claimable_micro_usdc / 1_000_000,
        access_grant_count: licenseCount,
        share_ppm: record.share_ppm,
        event_count: record.event_count,
        region: record.region,
        epoch: record.epoch,
      };
    })
    .filter((asset): asset is DashboardAsset => asset !== null);

  const dashboardLicenses: DashboardLicense[] = ownedLicenses.map((license) => ({
    license_id: license.data_license_id,
    buyer_id: license.buyer,
    asset_id: license.shard_id ?? license.data_asset_id,
    data_type: license.data_type,
    usdc_paid: 0,
    purchased_at: Date.now(),
    license_type: 'perpetual',
  }));

  const totalEarned = assets.reduce((sum, asset) => sum + asset.total_earned_usdc, 0);

  return {
    assets,
    licenses: dashboardLicenses.slice(0, 8),
    total_assets: assets.length,
    licenses_sold: dashboardLicenses.length,
    total_earned_usdc: totalEarned,
    access_grants: dashboardLicenses.length,
    rejected_access_attempts: 0,
    role_earnings_usdc: totalEarned,
    role_licenses_sold: dashboardLicenses.length,
  };
}
