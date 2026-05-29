/**
 * Batch decrypt all licensed DataAssets and write individual JSON files for the aggregator.
 *
 * For every entry in contracts/output/data_asset_registry.json that has a matching
 * DataLicense in data_license_registry.json, this script:
 *
 *  1. Requests the AES-256-GCM key from Seal (buyer's wallet + DataLicense proof).
 *  2. Fetches the encrypted blob from Walrus testnet by blob_id.
 *  3. Decrypts the PersonalDataset with AES-256-GCM.
 *  4. Expands PersonalDataset.assets[] into individual files:
 *       aggregator/output/buyer_workspace/decrypted_assets/<data_type>/<asset_id>.json
 *  5. Writes aggregator/output/buyer_workspace/decryption_manifest.json
 *
 * Security: AES key bytes are never written to disk. They exist only in memory
 * for the duration of one decrypt call, then discarded.
 *
 * Run via: pnpm --dir seal-access batch-decrypt
 *       or: pnpm aggregator:decrypt   (from project root)
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { config, projectRoot } from "./config.js";
import { fetchWalrusBlob } from "./walrusHttp.js";
import { decryptAes256Gcm } from "./decryptDataset.js";
import {
  loadDataAssetRegistry,
  loadDataLicenseRegistry,
  loadSealKeyRegistry,
  selectLicense,
  selectSealedKey,
} from "./keyRegistry.js";
import { requestDecryptKey } from "./sealClient.js";
import { loadLicensedBuyerSigner } from "./signers.js";
import type { DataLicenseRegistryRecord, SealKeyRegistryRecord } from "./types.js";

// ─── Types for the walrus upload manifest ─────────────────────────────────────

interface WalrusManifestRecord {
  user_id?: string;
  shard_id?: string;
  blob_id: string;
  data_type: string;
  compression?: "gzip";
  encryption: {
    algorithm: string;
    key_ref: string;
    iv: string;
    auth_tag: string;
  };
  [key: string]: unknown;
}

// ─── Types for the encrypted PersonalDataset blob ────────────────────────────

interface RawAsset {
  asset_id: string;
  owner_id: string;
  owner: string;
  role: string;
  data_type: string;
  contributors: unknown[];
  created_at?: string;
  events?: unknown[];
  [key: string]: unknown;
}

interface PersonalDataset {
  user_id: string;
  owner_addr: string;
  role: string;
  data_type: string;
  assets: RawAsset[];
  generated_at: string;
}

// ─── Output manifest entry ────────────────────────────────────────────────────

export interface DecryptionManifestEntry {
  user_id?: string;
  shard_id?: string;
  data_asset_id: string;
  blob_id: string;
  data_type: string;
  asset_count: number;
  asset_paths: string[];
  decrypted_at: string;
}

// ─── JSON loader ─────────────────────────────────────────────────────────────

const readJson = async <T>(filePath: string): Promise<T> => {
  const content = await readFile(filePath, "utf8");
  return JSON.parse(content) as T;
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export const batchDecryptAssets = async (): Promise<DecryptionManifestEntry[]> => {
  const buyerWorkspaceDir = path.join(
    projectRoot,
    "aggregator",
    "output",
    "buyer_workspace",
  );
  const decryptedAssetsDir = path.join(buyerWorkspaceDir, "decrypted_assets");

  // ── Wipe previous run's decrypted files ────────────────────────────────────
  // Prevents stale files from a prior run (e.g. with more licensed assets) from
  // mixing with this run's output and causing the Python aggregator to train on
  // inconsistent data.
  await rm(decryptedAssetsDir, { recursive: true, force: true });
  await mkdir(decryptedAssetsDir, { recursive: true });

  // ── Load all registries ──────────────────────────────────────────────────
  const dataAssets = await loadDataAssetRegistry();
  const licenses = await loadDataLicenseRegistry();
  const sealKeys = await loadSealKeyRegistry();

  const walrusManifest = await readJson<WalrusManifestRecord[]>(
    path.join(config.walrusOutputDir, "upload_manifest.json"),
  );
  const manifestById = new Map(walrusManifest.map((r) => [r.shard_id ?? r.user_id, r]));

  // ── Load buyer signer ────────────────────────────────────────────────────
  const buyerSigner = await loadLicensedBuyerSigner();
  const buyer = buyerSigner.getPublicKey().toSuiAddress();

  console.log(`Buyer wallet : ${buyer}`);
  console.log(`Licensed DataAssets: ${dataAssets.length}`);
  console.log(`Key server   : ${config.sealAggregatorUrl}`);
  console.log(`Walrus       : ${config.walrusAggregatorUrl}\n`);

  const decryptionManifest: DecryptionManifestEntry[] = [];

  for (const dataAsset of dataAssets) {
    const { data_asset_id, blob_id } = dataAsset;
    const recordId = dataAsset.shard_id ?? dataAsset.user_id;

    console.log(`── [${recordId}] ──────────────────────────────────────`);
    console.log(`   DataAsset : ${data_asset_id}`);
    console.log(`   Blob      : ${blob_id}`);

    // ── Find matching license and sealed key ───────────────────────────────
    let license: DataLicenseRegistryRecord;
    let sealedKey: SealKeyRegistryRecord;

    try {
      license = selectLicense(licenses, data_asset_id);
      sealedKey = selectSealedKey(sealKeys, data_asset_id);
    } catch (error) {
      console.warn(`   ⚠  Skipping: ${(error as Error).message}`);
      continue;
    }

    const walrusRecord = manifestById.get(recordId);
    if (!walrusRecord) {
      console.warn(`   ⚠  Skipping: ${recordId} not found in upload_manifest.json`);
      continue;
    }

    const { iv, auth_tag } = walrusRecord.encryption;
    if (!iv || !auth_tag) {
      console.warn(`   ⚠  Skipping: missing iv or auth_tag in upload_manifest.json`);
      continue;
    }

    // ── Request AES key from Seal ──────────────────────────────────────────
    let aesKey: Buffer;
    try {
      aesKey = await requestDecryptKey(sealedKey, license, buyerSigner);
      console.log(`   ✓ Seal released AES key (${aesKey.length} bytes)`);
    } catch (error) {
      console.error(`   ✗ Seal refused key: ${(error as Error).message}`);
      continue;
    }

    // ── Fetch encrypted blob from Walrus ───────────────────────────────────
    let encryptedBytes: Buffer;
    try {
      encryptedBytes = await fetchWalrusBlob(blob_id);
      console.log(`   ✓ Fetched ${encryptedBytes.length} bytes from Walrus`);
    } catch (error) {
      console.error(`   ✗ Walrus fetch failed: ${(error as Error).message}`);
      continue;
    }

    // ── Decrypt AES-256-GCM ────────────────────────────────────────────────
    let personalDataset: PersonalDataset;
    try {
      const decryptedBytes = decryptAes256Gcm(encryptedBytes, aesKey, iv, auth_tag);
      const plaintext = walrusRecord.compression === "gzip" ? gunzipSync(decryptedBytes) : decryptedBytes;
      personalDataset = JSON.parse(plaintext.toString("utf8")) as PersonalDataset;
      if (!Array.isArray(personalDataset.assets) || personalDataset.assets.length === 0) {
        throw new Error("PersonalDataset has no assets array");
      }
      console.log(`   ✓ Decrypted ${personalDataset.assets.length} raw asset(s)`);
    } catch (error) {
      console.error(`   ✗ Decryption / parse failed: ${(error as Error).message}`);
      continue;
    }

    // ── Write individual asset files ───────────────────────────────────────
    const assetPaths: string[] = [];

    for (const asset of personalDataset.assets) {
      if (!asset.asset_id || !asset.data_type) {
        console.warn(`   ⚠  Skipping asset with missing asset_id or data_type`);
        continue;
      }

      const assetDir = path.join(decryptedAssetsDir, asset.data_type);
      await mkdir(assetDir, { recursive: true });

      const assetPath = path.join(assetDir, `${asset.asset_id}.json`);
      await writeFile(assetPath, `${JSON.stringify(asset, null, 2)}\n`, "utf8");

      const relPath = path.relative(projectRoot, assetPath);
      assetPaths.push(relPath);
      console.log(`   → ${relPath}`);
    }

    decryptionManifest.push({
      user_id: dataAsset.user_id,
      shard_id: dataAsset.shard_id,
      data_asset_id,
      blob_id,
      data_type: dataAsset.data_type,
      asset_count: personalDataset.assets.length,
      asset_paths: assetPaths,
      decrypted_at: new Date().toISOString(),
    });
  }

  // ── Write decryption manifest ──────────────────────────────────────────────
  await mkdir(buyerWorkspaceDir, { recursive: true });
  const manifestPath = path.join(buyerWorkspaceDir, "decryption_manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(decryptionManifest, null, 2)}\n`, "utf8");

  const total = decryptionManifest.reduce((sum, e) => sum + e.asset_count, 0);
  console.log(`\nBatch decrypt complete.`);
  console.log(`  ${decryptionManifest.length} DataAsset(s) decrypted.`);
  console.log(`  ${total} individual asset file(s) written.`);
  console.log(`  Manifest: ${path.relative(projectRoot, manifestPath)}`);

  return decryptionManifest;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  batchDecryptAssets().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
