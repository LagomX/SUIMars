/**
 * Thin HTTP helper for reading blobs from a Walrus aggregator.
 *
 * Extracted here so both decryptDataset.ts and batchDecrypt.ts share a single
 * implementation — previously each file had its own identical copy.
 */

import { config } from "./config.js";

/**
 * Fetch the raw bytes of a Walrus blob by its blob ID.
 *
 * Throws on HTTP error status or empty response body.
 */
export const fetchWalrusBlob = async (blobId: string): Promise<Buffer> => {
  const url = `${config.walrusAggregatorUrl.replace(/\/$/, "")}/v1/blobs/${blobId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Walrus read failed (${response.status} ${response.statusText}) for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length === 0) {
    throw new Error(`Walrus returned an empty blob for ${blobId}`);
  }
  return bytes;
};
