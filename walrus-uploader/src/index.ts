import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config";
import { encryptJson } from "./crypto";
import { uploadEncryptedBlob } from "./walrus";
import { registerDataAssetOnSui } from "./sui";
import type { ContributorInput, DataPackage, KeyRecord, OrderEvent, UploadResult } from "./types";

type RoleAsset = {
  assetId: string;
  contributorId: string;
  dataType: "rider_mobility" | "merchant_operations" | "consumer_behavior";
  payload: unknown;
  contributors: ContributorInput[];
};

const readPackages = async (): Promise<DataPackage[]> => {
  const files = (await readdir(config.simulatorPackagesDir))
    .filter((file) => file.endsWith(".json"))
    .sort();

  const packages: DataPackage[] = [];
  for (const file of files) {
    const fullPath = path.join(config.simulatorPackagesDir, file);
    packages.push(JSON.parse(await readFile(fullPath, "utf8")) as DataPackage);
  }
  return packages;
};

const uniqueCustomerIds = (orders: OrderEvent[]): string[] =>
  [...new Set(orders.map((order) => order.customer_id))].sort();

const buildRoleAssets = (dataPackage: DataPackage): RoleAsset[] => {
  const consumerIds = uniqueCustomerIds(dataPackage.orders);
  const consumerContributorId =
    consumerIds.length === 1 ? consumerIds[0] : `${dataPackage.package_id}_consumer_group`;

  return [
    {
      assetId: `${dataPackage.package_id}_rider_mobility`,
      contributorId: dataPackage.rider_id,
      dataType: "rider_mobility",
      payload: {
        package_id: dataPackage.package_id,
        data_type: "rider_mobility",
        rider_id: dataPackage.rider_id,
        orders: dataPackage.orders.map((order) => ({
          order_id: order.order_id,
          rider_id: order.rider_id,
          merchant_id: order.merchant_id,
          customer_id: order.customer_id,
          gps_track: order.gps_track,
          picked_up_at: order.picked_up_at,
          delivered_at: order.delivered_at,
          delivery_time_seconds: order.delivery_time_seconds,
          distance_km: order.distance_km,
          confirmations: { rider_confirmed: order.confirmations.rider_confirmed },
        })),
        created_at: dataPackage.created_at,
      },
      contributors: [
        {
          participant_id: dataPackage.rider_id,
          role: "rider",
          weight_bps: 10000,
          address: config.contributorAddresses.rider,
        },
      ],
    },
    {
      assetId: `${dataPackage.package_id}_merchant_operations`,
      contributorId: dataPackage.merchant_id,
      dataType: "merchant_operations",
      payload: {
        package_id: dataPackage.package_id,
        data_type: "merchant_operations",
        merchant_id: dataPackage.merchant_id,
        orders: dataPackage.orders.map((order) => ({
          order_id: order.order_id,
          merchant_id: order.merchant_id,
          merchant_location: order.merchant_location,
          items: order.items,
          order_amount_usdc: order.order_amount_usdc,
          order_created_at: order.order_created_at,
          picked_up_at: order.picked_up_at,
          confirmations: { merchant_confirmed: order.confirmations.merchant_confirmed },
        })),
        created_at: dataPackage.created_at,
      },
      contributors: [
        {
          participant_id: dataPackage.merchant_id,
          role: "merchant",
          weight_bps: 10000,
          address: config.contributorAddresses.merchant,
        },
      ],
    },
    {
      assetId: `${dataPackage.package_id}_consumer_behavior`,
      contributorId: consumerContributorId,
      dataType: "consumer_behavior",
      payload: {
        package_id: dataPackage.package_id,
        data_type: "consumer_behavior",
        consumer_ids: consumerIds,
        orders: dataPackage.orders.map((order) => ({
          order_id: order.order_id,
          customer_id: order.customer_id,
          delivery_location: order.delivery_location,
          items: order.items,
          order_amount_usdc: order.order_amount_usdc,
          order_created_at: order.order_created_at,
          delivered_at: order.delivered_at,
          confirmations: { customer_confirmed: order.confirmations.customer_confirmed },
        })),
        created_at: dataPackage.created_at,
      },
      contributors: [
        {
          participant_id: consumerContributorId,
          role: "consumer",
          weight_bps: 10000,
          address: config.contributorAddresses.consumer,
        },
      ],
    },
  ];
};

const validateBlobId = (blobId: string): void => {
  if (!blobId.trim()) {
    throw new Error("Walrus upload returned an empty blob_id");
  }
};

const writeJson = async (filePath: string, data: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
};

const main = async (): Promise<void> => {
  await rm(config.outputDir, { recursive: true, force: true });
  await mkdir(config.outputDir, { recursive: true });

  const packages = await readPackages();
  const uploadResults: UploadResult[] = [];
  const keyRecords: KeyRecord[] = [];

  for (const dataPackage of packages) {
    for (const roleAsset of buildRoleAssets(dataPackage)) {
      const encrypted = encryptJson(roleAsset.payload);
      const blobId = await uploadEncryptedBlob(encrypted.ciphertext);
      validateBlobId(blobId);

      const txDigest = await registerDataAssetOnSui({
        assetId: roleAsset.assetId,
        packageId: dataPackage.package_id,
        blobId,
        contributors: roleAsset.contributors,
        dataType: roleAsset.dataType,
      });

      const keyId = `key_${roleAsset.assetId}`;
      keyRecords.push({
        key_id: keyId,
        asset_id: roleAsset.assetId,
        package_id: dataPackage.package_id,
        blob_id: blobId,
        keyHex: encrypted.keyHex,
        ivHex: encrypted.ivHex,
        authTagHex: encrypted.authTagHex,
        algorithm: "aes-256-gcm",
        created_at: Date.now(),
      });

      uploadResults.push({
        asset_id: roleAsset.assetId,
        package_id: dataPackage.package_id,
        rider_id: dataPackage.rider_id,
        merchant_id: dataPackage.merchant_id,
        contributor_id: roleAsset.contributorId,
        blob_id: blobId,
        tx_digest: txDigest,
        data_type: roleAsset.dataType,
        ciphertext_bytes: encrypted.ciphertext.length,
        key_id: keyId,
        created_at: Date.now(),
      });

      console.log(
        `${roleAsset.assetId}: data_type=${roleAsset.dataType} blob_id=${blobId} tx=${txDigest}`,
      );
    }
  }

  // MVP only: key metadata is stored locally for development. Future V4/V5 should
  // register encryption keys with Seal instead of writing local key material.
  await writeJson(path.join(config.outputDir, "keys.json"), keyRecords);
  await writeJson(path.join(config.outputDir, "upload_results.json"), uploadResults);

  console.log(`Processed ${packages.length} packages`);
  console.log(`Wrote ${uploadResults.length} upload result records`);
  console.log(`Output directory: ${config.outputDir}`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
