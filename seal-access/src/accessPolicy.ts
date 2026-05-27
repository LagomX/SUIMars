import type { SealAccessPolicy } from "./types.js";

/**
 * Build the Seal access policy for a Mars DataAsset.
 *
 * ─── Policy intent ────────────────────────────────────────────────────────────
 * A buyer may decrypt the dataset only if the buyer's wallet owns a `DataLicense`
 * object on Sui whose `data_asset_id` field equals the target DataAsset's
 * on-chain Sui object ID.
 *
 * The corresponding Move accessor already exists:
 *   mars::data_license::verify_license(asset, license, requester) → bool
 *
 * The Seal identity is the DataAsset object ID. Seal key servers dry-run the
 * Move `seal_approve` function and only release the AES key when the requester
 * owns a matching DataLicense.
 */
export const buildDataLicensePolicy = (
  dataAssetId: string,
  packageId?: string,
): SealAccessPolicy => {
  if (!dataAssetId?.trim()) {
    throw new Error("data_asset_id is required to build a DataLicense access policy.");
  }

  const resolvedPackageId =
    packageId?.trim() || process.env.SEAL_PACKAGE_ID?.trim() || null;

  const moveCall = resolvedPackageId
    ? `${resolvedPackageId}::data_license::seal_approve`
    : null;

  return {
    policy_type: "DATA_LICENSE_OWNERSHIP",
    data_asset_id: dataAssetId,
    chain: "sui_testnet",
    condition: `Buyer owns a DataLicense where data_asset_id == "${dataAssetId}"`,
    move_call: moveCall,
    seal_id: dataAssetId,
  };
};

/**
 * Return a human-readable multi-line explanation of a Seal access policy.
 * Useful for CLI output and debugging.
 */
export const explainPolicy = (policy: SealAccessPolicy): string => {
  const lines = [
    `Policy type : ${policy.policy_type}`,
    `DataAsset   : ${policy.data_asset_id}`,
    `Chain       : ${policy.chain}`,
    `Condition   : ${policy.condition}`,
    `Move call   : ${policy.move_call ?? "(missing package id)"}`,
    `Seal ID     : ${policy.seal_id ?? "(missing)"}`,
  ];
  return lines.join("\n");
};
