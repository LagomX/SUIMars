import type { SealContext } from "./mock-seal";
import type { VerificationResult } from "./types";

export const verifyLicenseOwnership = (
  context: SealContext,
  buyerId: string,
  assetId: string,
): VerificationResult => {
  if (!context.assetById.has(assetId)) {
    return { valid: false, reason: "asset_not_found" };
  }

  const matchingLicense = (context.licensesByAssetId.get(assetId) ?? []).find(
    (license) => license.buyer_id === buyerId && license.license_type === "perpetual",
  );

  if (!matchingLicense) {
    return { valid: false, reason: "license_not_found" };
  }

  return { valid: true, license_id: matchingLicense.license_id };
};
