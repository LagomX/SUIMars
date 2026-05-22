export type DataType = "rider_mobility" | "merchant_operations" | "consumer_behavior";
export type ContributorRole = "rider" | "merchant" | "consumer";

export interface UploadResult {
  asset_id: string;
  package_id: string;
  rider_id: string;
  merchant_id: string;
  contributor_id: string;
  blob_id: string;
  tx_digest: string;
  data_type: DataType;
  ciphertext_bytes: number;
  key_id: string;
  created_at: number;
}

export interface RegisteredContributor {
  participant_id: string;
  role: ContributorRole;
  weight_bps: number;
}

export interface RegistrationRecord {
  asset_id: string;
  package_id: string;
  blob_id: string;
  contributors: RegisteredContributor[];
  data_type: DataType;
  tx_digest: string;
  created_at: number;
}

export interface ListedAsset {
  asset_id: string;
  package_id: string;
  blob_id: string;
  data_type: DataType;
  for_sale: boolean;
  price_usdc: number;
  contributor: RegisteredContributor;
  reward_pool_usdc: number;
  listed_at: number;
}

export interface Purchase {
  purchase_id: string;
  buyer_id: string;
  asset_id: string;
  data_type: DataType;
  usdc_paid: number;
  purchased_at: number;
}

export interface DataLicense {
  license_id: string;
  buyer_id: string;
  asset_id: string;
  data_type: DataType;
  usdc_paid: number;
  purchased_at: number;
  license_type: "perpetual";
}

export interface RewardDistribution {
  asset_id: string;
  contributor_id: string;
  role: ContributorRole;
  amount_usdc: number;
  distributed_at: number;
}

export interface ContributorEarnings {
  contributors: Record<
    string,
    {
      contributor_id: string;
      role: ContributorRole;
      total_usdc: number;
      licenses_sold: number;
    }
  >;
  roles: Record<ContributorRole, { total_usdc: number; licenses_sold: number }>;
}

export interface FlowState {
  listings: ListedAsset[];
  purchases: Purchase[];
  licenses: DataLicense[];
  distributions: RewardDistribution[];
  earnings: ContributorEarnings;
}
