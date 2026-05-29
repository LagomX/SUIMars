import { config } from "./config.js";

const TESTNET_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";

const findBlobId = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined;

  if (Array.isArray(value)) {
    for (const item of value) {
      const id = findBlobId(item);
      if (id) return id;
    }
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const key of ["blobId", "blob_id", "blobID"]) {
    if (typeof record[key] === "string" && (record[key] as string).trim()) {
      return record[key] as string;
    }
  }
  for (const [key, child] of Object.entries(record)) {
    if (/blob[_-]?id/i.test(key) && typeof child === "string" && child.trim()) {
      return child;
    }
  }
  for (const child of Object.values(record)) {
    const id = findBlobId(child);
    if (id) return id;
  }
  return undefined;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const uploadEncryptedBlob = async (bytes: Buffer): Promise<{ blobId: string }> => {
  if (bytes.length === 0) throw new Error("Refusing to upload empty encrypted bytes");

  const publisherBase = config.walrusPublisherUrl ?? TESTNET_PUBLISHER;
  const url = `${publisherBase}/v1/blobs?epochs=${config.walrusEpochs}`;
  const body = new Uint8Array(bytes);

  for (let attempt = 1; attempt <= 6; attempt++) {
    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body,
      });
    } catch {
      await sleep(attempt * 2000);
      continue;
    }

    if (resp.status === 429 || resp.status >= 500) {
      await sleep(attempt * 3000);
      continue;
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Walrus publisher returned HTTP ${resp.status}: ${text.slice(0, 300)}`);
    }

    const json = (await resp.json()) as unknown;
    const blobId = findBlobId(json);
    if (!blobId?.trim()) {
      throw new Error(`Walrus publisher response missing blob ID: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return { blobId };
  }

  throw new Error("Walrus publisher unreachable after 6 retries");
};
