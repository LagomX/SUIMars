import type { SealContext } from "./mock-seal";
import type { ReleasedKeyData, VerificationResult } from "./types";
import { verifyLicenseOwnership } from "./verifier";

export const releaseDecryptionKey = (
  context: SealContext,
  buyerId: string,
  assetId: string,
): { verification: VerificationResult; keyData?: ReleasedKeyData } => {
  const verification = verifyLicenseOwnership(context, buyerId, assetId);
  if (!verification.valid) {
    return { verification };
  }

  const key = context.keyByAssetId.get(assetId);
  if (!key) {
    return { verification: { valid: false, reason: "key_not_found" } };
  }

  return {
    verification,
    keyData: {
      asset_id: assetId,
      blob_id: key.blob_id,
      keyHex: key.keyHex,
      ivHex: key.ivHex,
      authTagHex: key.authTagHex,
    },
  };
};
