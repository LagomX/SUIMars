/**
 * Core decryption orchestrator for Mars Seal Access.
 *
 * Flow:
 *   1. Load and validate walrus-uploader/output/upload_manifest.json
 *   2. Load walrus-uploader/output/encrypted/<user_id>.bin
 *   3. Build the DataLicense access policy
 *   4. Request the AES key via the Seal adapter (mock or real)
 *   5. Decrypt the blob locally with AES-256-GCM
 *   6. Write output/decrypted_dataset.json
 *   7. Write output/seal_access_receipt.json
 *
 * Security note:
 *   Decryption happens entirely on the buyer's local machine.
 *   In production, the decrypted plaintext should NEVER leave the buyer's
 *   environment.  output/decrypted_dataset.json is for demo purposes only.
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDecipheriv } from "node:crypto";
import { config } from "./config.js";
import { buildDataLicensePolicy, explainPolicy } from "./accessPolicy.js";
import { fetchWalrusBlob } from "./walrusHttp.js";
import { requestDecryptKey } from "./sealClient.js";
import { loadWalrusDatasetInput } from "./walrusOutput.js";
import {
  loadDataAssetRegistry,
  loadDataLicenseRegistry,
  loadSealKeyRegistry,
  parsePublishedPackageId,
  selectDataAsset,
  selectLicense,
  selectSealedKey,
} from "./keyRegistry.js";
import { loadLicensedBuyerSigner, loadUnlicensedSimulatorSigner } from "./signers.js";
import type { DataAssetMetadata, SealAccessReceipt } from "./types.js";

// ─── Decrypt options ────────────────────────────────────────────────────────

export interface DecryptOptions {
  userId?: string;
  walrusOutputDir?: string;
  useUnlicensedSimulatorUser?: boolean;
}

// ─── AES-256-GCM decryption ────────────────────────────────────────────────

/**
 * Decrypt a buffer encrypted with AES-256-GCM.
 *
 * ⚠️  The key bytes are used here and immediately discarded; they are never
 *     written to any file.  In production, this function should run inside the
 *     buyer's trusted environment only.
 *
 * @param encryptedBytes  Raw ciphertext (no IV or auth-tag prepended).
 * @param keyHex          32-byte AES-256-GCM key as hex string.
 * @param ivHex           12-byte IV as hex string.
 * @param authTagHex      16-byte GCM authentication tag as hex string.
 * @returns               Decrypted plaintext as a Buffer.
 */
export const decryptAes256Gcm = (
  encryptedBytes: Buffer,
  keyBytes: Buffer,
  ivHex: string,
  authTagHex: string,
): Buffer => {
  const iv      = Buffer.from(ivHex,      "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  if (keyBytes.length !== 32) {
    throw new Error(`AES-256-GCM requires a 32-byte key; got ${keyBytes.length} bytes.`);
  }
  if (iv.length !== 12) {
    throw new Error(`AES-256-GCM requires a 12-byte IV; got ${iv.length} bytes.`);
  }
  if (authTag.length !== 16) {
    throw new Error(`AES-256-GCM requires a 16-byte auth tag; got ${authTag.length} bytes.`);
  }

  const decipher = createDecipheriv("aes-256-gcm", keyBytes, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedBytes), decipher.final()]);

  if (decrypted.length === 0) {
    throw new Error("Decryption produced empty plaintext — possible data corruption.");
  }

  return decrypted;
};

// ─── Main orchestrator ──────────────────────────────────────────────────────

/**
 * Load inputs, verify the Seal access policy, decrypt the dataset, and write
 * output files.
 *
 * Throws on any validation or decryption failure.
 * In mock mode, also throws MockAccessDeniedError when MOCK_BUYER_HAS_LICENSE=false.
 */
export const decryptDatasetWithSealAccess = async (
  opts: DecryptOptions = {},
): Promise<SealAccessReceipt> => {
  const mode = "real";
  const packageId = await parsePublishedPackageId();
  const dataAsset = selectDataAsset(await loadDataAssetRegistry(), opts.userId);
  const walrusInput = await loadWalrusDatasetInput(dataAsset.user_id, opts.walrusOutputDir);
  const metadata = walrusInput.metadata;
  validateMetadata(metadata);  // defence-in-depth: walrusOutput already validates, but we check here too
  const sealedKey = selectSealedKey(await loadSealKeyRegistry(), dataAsset.data_asset_id);
  const license = selectLicense(await loadDataLicenseRegistry(), dataAsset.data_asset_id);
  const buyerSigner = opts.useUnlicensedSimulatorUser
    ? await loadUnlicensedSimulatorSigner()
    : await loadLicensedBuyerSigner();
  const buyer = buyerSigner.getPublicKey().toSuiAddress();

  if (metadata.blob_id !== dataAsset.blob_id || sealedKey.blob_id !== dataAsset.blob_id) {
    throw new Error(`Input mismatch for ${dataAsset.user_id}: blob_id differs across registries`);
  }

  const policy = buildDataLicensePolicy(dataAsset.data_asset_id, packageId);

  console.log(`\nAccess policy:\n${explainPolicy(policy)}\n`);

  // ── Prepare output dir ───────────────────────────────────────────────────
  await mkdir(config.outputDir, { recursive: true });

  // ── Request AES key from Seal ─────────────────────────────────────────────
  let aesKey: Buffer;
  try {
    aesKey = await requestDecryptKey(sealedKey, license, buyerSigner);
  } catch (error) {
    const denialReceipt: SealAccessReceipt = {
      mode,
      buyer,
      data_asset_id: dataAsset.data_asset_id,
      data_license_id: license.data_license_id,
      blob_id: metadata.blob_id,
      policy: "DATA_LICENSE_OWNERSHIP",
      access_granted: false,
      reason: `Seal refused key release: ${(error as Error).message}`,
      timestamp: new Date().toISOString(),
    };
    await writeReceipt(denialReceipt);
    throw error;
  }

  // ── Validate IV and auth tag are present ─────────────────────────────────
  const ivHex = metadata.encryption.iv;
  const authTagHex = metadata.encryption.auth_tag;

  if (!ivHex) {
    throw new Error(
      "IV is missing from both the demo key file and the metadata. " +
        "Ensure the encrypted blob was produced by walrus-uploader.",
    );
  }
  if (!authTagHex) {
    throw new Error(
      "Auth tag is missing from both the demo key file and the metadata. " +
        "Ensure the encrypted blob was produced by walrus-uploader.",
    );
  }

  console.log(`Fetching encrypted blob from Walrus: ${metadata.blob_id}`);
  const encryptedBytes = await fetchWalrusBlob(metadata.blob_id);

  console.log("Decrypting AES-256-GCM blob locally with key released by Seal...");
  const plaintext = decryptAes256Gcm(encryptedBytes, aesKey, ivHex, authTagHex);
  console.log(`Decrypted ${plaintext.length} bytes.`);

  // ── Parse decrypted JSON ──────────────────────────────────────────────────
  let decryptedJson: unknown;
  try {
    decryptedJson = JSON.parse(plaintext.toString("utf8"));
  } catch {
    throw new Error(
      "Decrypted bytes are not valid JSON. " +
        "The encrypted blob may be corrupted or the wrong key was used.",
    );
  }

  // ── Write output files ────────────────────────────────────────────────────
  const decryptedOutputPath = path.join(config.outputDir, "decrypted_dataset.json");

  // NOTE: In production, decrypted plaintext should never be written to disk.
  //       This output is for hackathon demo purposes only.
  await writeFile(
    decryptedOutputPath,
    `${JSON.stringify(decryptedJson, null, 2)}\n`,
    "utf8",
  );
  console.log(`Decrypted dataset written to: ${decryptedOutputPath}`);

  const receipt: SealAccessReceipt = {
    mode,
    buyer,
    data_asset_id: dataAsset.data_asset_id,
    data_license_id: license.data_license_id,
    blob_id: metadata.blob_id,
    policy: "DATA_LICENSE_OWNERSHIP",
    access_granted: true,
    reason: "Seal key servers verified DataLicense ownership on Sui testnet",
    timestamp: new Date().toISOString(),
    decrypted_output_path: path.relative(process.cwd(), decryptedOutputPath),
  };

  await writeReceipt(receipt);

  return receipt;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const validateMetadata = (meta: DataAssetMetadata): void => {
  if (!meta.blob_id?.trim()) {
    throw new Error("Metadata is missing required field: blob_id.");
  }
  if (!meta.data_type?.trim()) {
    throw new Error("Metadata is missing required field: data_type.");
  }
  if (!Array.isArray(meta.contributors) || meta.contributors.length === 0) {
    throw new Error("Metadata contributors must be a non-empty array.");
  }
  if (meta.encryption?.algorithm !== "AES-256-GCM") {
    throw new Error(
      `Unsupported encryption algorithm: "${meta.encryption?.algorithm}". ` +
        `Only "AES-256-GCM" is supported.`,
    );
  }
  if (!meta.encryption.key_ref?.trim()) {
    throw new Error("Metadata is missing required field: encryption.key_ref.");
  }
};


const writeReceipt = async (receipt: SealAccessReceipt): Promise<void> => {
  const receiptPath = path.join(config.outputDir, "seal_access_receipt.json");
  await writeFile(
    receiptPath,
    `${JSON.stringify(receipt, null, 2)}\n`,
    "utf8",
  );
  console.log(`Access receipt written to: ${receiptPath}`);
};
