export interface GpsPoint {
  lat: number;
  lng: number;
  timestamp: number;
}

export interface OrderItem {
  name: string;
  price_usdc: number;
  quantity: number;
}

export interface OrderEvent {
  order_id: string;
  customer_id: string;
  merchant_id: string;
  rider_id: string;
  merchant_location: GpsPoint;
  delivery_location: GpsPoint;
  gps_track: GpsPoint[];
  order_created_at: number;
  picked_up_at: number;
  delivered_at: number;
  delivery_time_seconds: number;
  distance_km: number;
  order_amount_usdc: number;
  items: OrderItem[];
  confirmations: {
    customer_confirmed: boolean;
    merchant_confirmed: boolean;
    rider_confirmed: boolean;
  };
}

export interface DataPackage {
  package_id: string;
  rider_id: string;
  merchant_id: string;
  orders: OrderEvent[];
  aggregated_metrics: {
    total_distance_km: number;
    avg_delivery_time_seconds: number;
    avg_order_amount_usdc: number;
    peak_hour_distribution: Record<string, number>;
    gps_point_count: number;
  };
  created_at: number;
}

export interface ContributorInput {
  participant_id: string;
  role: "rider" | "merchant" | "consumer";
  weight_bps: number;
  address?: string;
}

export interface RegisterDataAssetParams {
  assetId: string;
  packageId: string;
  blobId: string;
  contributors: ContributorInput[];
  dataType: string;
}

export interface UploadResult {
  asset_id: string;
  package_id: string;
  rider_id: string;
  merchant_id: string;
  contributor_id: string;
  blob_id: string;
  tx_digest: string;
  sui_object_id?: string;
  sui_object_version?: string;
  sui_object_digest?: string;
  data_type: string;
  ciphertext_bytes: number;
  key_id: string;
  created_at: number;
}

export interface KeyRecord {
  key_id: string;
  asset_id: string;
  package_id: string;
  blob_id: string;
  keyHex: string;
  ivHex: string;
  authTagHex: string;
  algorithm: "aes-256-gcm";
  created_at: number;
}

export interface RegistrationRecord {
  asset_id: string;
  package_id: string;
  blob_id: string;
  contributors: ContributorInput[];
  data_type: string;
  tx_digest: string;
  sui_object_id?: string;
  sui_object_version?: string;
  sui_object_digest?: string;
  created_at: number;
}

export interface SuiRegistrationResult {
  txDigest: string;
  dataAssetObjectId?: string;
  dataAssetObjectVersion?: string;
  dataAssetObjectDigest?: string;
}
