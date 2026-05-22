export type DataType = "rider_mobility" | "merchant_operations" | "consumer_behavior";

export interface UploadResult {
  asset_id: string;
  package_id: string;
  blob_id: string;
  data_type: DataType;
  key_id: string;
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

export interface VerificationResult {
  valid: boolean;
  license_id?: string;
  reason?: string;
}

export interface ReleasedKeyData {
  asset_id: string;
  blob_id: string;
  keyHex: string;
  ivHex: string;
  authTagHex: string;
}

export interface AccessResult {
  buyer_id: string;
  asset_id: string;
  license_id: string;
  blob_id: string;
  access_granted: true;
  decrypted_successfully: true;
  data_type: DataType;
  order_count: number;
  verified_at: number;
}

export interface RejectedAccessAttempt {
  buyer_id: string;
  asset_id: string;
  reason: string;
  rejected: true;
}
