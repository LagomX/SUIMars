// ─────────────────────────────────────────────────────────────────────────────
// Mars Seal Access — core domain types
// ─────────────────────────────────────────────────────────────────────────────

export type Role = "rider" | "merchant" | "consumer";

/** One party's revenue share in a DataAsset, mirroring the Move Contributor struct. */
export interface Contributor {
  /** Sui address (starts with 0x). */
  addr: string;
  role: Role;
  /** Basis points; all contributors in one asset must sum to 10 000. */
  weight_bps: number;
}

/**
 * Metadata produced by walrus-uploader for every uploaded DataAsset.
 *
 * This is the canonical format the seal-access module reads from
 * `walrus-uploader/output/upload_manifest.json`.  It intentionally does NOT contain the
 * on-chain DataAsset object ID — that is passed separately as `--data-asset-id`
 * (or `DATA_ASSET_ID` env var) because it is only known after the DataAsset is
 * registered on Sui via `data_asset::register_data_asset`.
 */
export interface DataAssetMetadata {
  blob_id: string;
  data_type: string;
  contributors: Contributor[];
  encryption: {
    algorithm: "AES-256-GCM";
    /** Reference string used to look up the key material (e.g. "local_demo_key:consumer_001"). */
    key_ref: string;
    iv?: string;
    auth_tag?: string;
  };
  walrus: {
    network: "testnet";
    uploaded_at: string;
  };
}

export type PolicyType = "DATA_LICENSE_OWNERSHIP";

/**
 * Describes the Seal access policy for one DataAsset.
 *
 * Mars policy: a buyer may decrypt the dataset only if the buyer's wallet owns a
 * `DataLicense` object (on Sui) whose `data_asset_id` field equals the target
 * DataAsset's on-chain object ID.
 */
export interface SealAccessPolicy {
  policy_type: PolicyType;
  /** On-chain Sui object ID of the target DataAsset. */
  data_asset_id: string;
  chain: "sui_testnet" | "sui_mainnet";
  /** Human-readable condition string. */
  condition: string;
  /**
   * Fully-qualified Move function that Seal key servers call to verify access.
   * Format: "{package_id}::{module}::{function}"
   *
   * Set to "{DEPLOYED_PACKAGE_ID}::data_license::seal_approve".
   *
   * Move function signature (implemented in contracts/mars/sources/data_license.move):
   *   public fun seal_approve(
   *       id: vector<u8>,         // BCS bytes of the DataAsset object ID
   *       license: &DataLicense,  // buyer-owned DataLicense object
   *       asset:   &DataAsset,    // shared DataAsset object
   *       ctx:     &TxContext,
   *   )
   *   — aborts EUnauthorized if id ≠ bcs(object::id(asset)) or buyer ≠ ctx.sender()
   */
  move_call: string | null;
  /**
   * Seal IBE identity under which the AES key is encrypted.
   * Set to the DataAsset's on-chain Sui object ID (hex string, starts with 0x).
   * Matches bcs::to_bytes(&object::id(asset)) used inside seal_approve.
   */
  seal_id: string | null;
}

export interface DataAssetRegistryRecord {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
}

export interface DataLicenseRegistryRecord {
  user_id: string;
  data_asset_id: string;
  data_license_id: string;
  buyer: string;
  data_type: string;
}

export interface SealKeyRegistryRecord {
  user_id: string;
  blob_id: string;
  data_asset_id: string;
  data_type: string;
  key_ref: string;
  seal_id: string;
  move_package_id?: string;
  package_id: string;
  threshold: number;
  key_servers: Array<{
    object_id: string;
    weight: number;
    aggregator_url?: string;
  }>;
  encrypted_key_b64: string;
  registered_at: string;
}

/**
 * Written to `output/seal_access_receipt.json` after every decrypt run.
 * Records whether access was granted and why.
 */
export interface SealAccessReceipt {
  mode: "real";
  buyer: string;
  data_asset_id: string;
  data_license_id?: string;
  blob_id: string;
  policy: PolicyType;
  access_granted: boolean;
  reason: string;
  timestamp: string;
  /** Relative path to decrypted output, only present when access_granted is true. */
  decrypted_output_path?: string;
}
