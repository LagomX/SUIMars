import dotenv from "dotenv";
import { decryptBlob } from "./decrypt";
import { releaseDecryptionKey } from "./key-release";
import { loadSealContext } from "./mock-seal";
import { resetOutputDir, writeSealOutputs } from "./output";
import type { AccessResult, DataLicense, RejectedAccessAttempt } from "./types";
import { verifyLicenseOwnership } from "./verifier";

dotenv.config();

const now = (): number => Date.now();

const makeRejectedAttempt = (
  buyerId: string,
  assetId: string,
  reason: string,
): RejectedAccessAttempt => ({
  buyer_id: buyerId,
  asset_id: assetId,
  reason,
  rejected: true,
});

const validateAccessResult = (license: DataLicense, result: AccessResult): void => {
  if (result.buyer_id !== license.buyer_id || result.asset_id !== license.asset_id) {
    throw new Error(`Access result does not match license ${license.license_id}`);
  }
  if (!result.decrypted_successfully || !result.access_granted) {
    throw new Error(`Access result is not successful for ${license.license_id}`);
  }
  if (result.order_count <= 0) {
    throw new Error(`Decrypted payload has no orders for ${license.license_id}`);
  }
};

const main = async (): Promise<void> => {
  const context = await loadSealContext();
  await resetOutputDir();

  const accessResults: AccessResult[] = [];
  const rejectedAccessAttempts: RejectedAccessAttempt[] = [];

  for (const license of context.licenses) {
    const released = releaseDecryptionKey(context, license.buyer_id, license.asset_id);
    if (!released.verification.valid || !released.keyData || !released.verification.license_id) {
      throw new Error(
        `Valid license was rejected: ${license.license_id} (${released.verification.reason ?? "unknown"})`,
      );
    }

    const decrypted = await decryptBlob(license.asset_id, released.keyData);
    if (decrypted.data_type !== license.data_type) {
      throw new Error(`Data type mismatch for ${license.license_id}`);
    }

    const accessResult: AccessResult = {
      buyer_id: license.buyer_id,
      asset_id: license.asset_id,
      license_id: released.verification.license_id,
      blob_id: released.keyData.blob_id,
      access_granted: true,
      decrypted_successfully: true,
      data_type: license.data_type,
      order_count: decrypted.order_count,
      verified_at: now(),
    };
    validateAccessResult(license, accessResult);
    accessResults.push(accessResult);
  }

  const firstAsset = context.assets[0];
  const firstLicense = context.licenses[0];
  const invalidCases = [
    { buyerId: "ai_company_without_license", assetId: firstAsset.asset_id },
    { buyerId: firstLicense.buyer_id, assetId: "fake_asset_id" },
    { buyerId: "fake_buyer_id", assetId: firstLicense.asset_id },
  ];

  for (const attempt of invalidCases) {
    const released = releaseDecryptionKey(context, attempt.buyerId, attempt.assetId);
    if (released.keyData) {
      throw new Error(`Invalid access received key data: ${attempt.buyerId}/${attempt.assetId}`);
    }

    const verification = verifyLicenseOwnership(context, attempt.buyerId, attempt.assetId);
    rejectedAccessAttempts.push(
      makeRejectedAttempt(attempt.buyerId, attempt.assetId, verification.reason ?? "access_denied"),
    );
  }

  await writeSealOutputs(accessResults, rejectedAccessAttempts);

  console.log(`Valid licenses checked: ${context.licenses.length}`);
  console.log(`Access grants: ${accessResults.length}`);
  console.log(`Successful decryptions: ${accessResults.length}`);
  console.log(`Rejected invalid attempts: ${rejectedAccessAttempts.length}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
