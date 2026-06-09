import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { sampleDatasets, type Dataset, type DatasetAsset } from "@/lib/sample-datasets"

export type { Dataset, DatasetAsset }

type Contributor = {
  addr: string
  role: "rider" | "merchant" | "consumer"
  weight_bps: number
}

type UploadManifestRecord = {
  user_id?: string
  shard_id?: string
  dataset_collection_id?: string
  owner_addr?: string
  role?: "rider" | "merchant" | "consumer"
  data_type: string
  region?: string
  epoch?: string
  blob_id: string
  shard_content_hash?: string
  contributor_root?: string
  authorization_root?: string
  accounting_root?: string
  total_contributors?: number
  total_events?: number
  contributor_count?: number
  asset_count?: number
  event_count?: number
  contributors: Contributor[]
  walrus?: { uploaded_at?: string }
  encryption?: { iv?: string; auth_tag?: string; algorithm?: string; key_ref?: string }
}

type DataAssetRegistryRecord = {
  user_id?: string
  shard_id?: string
  dataset_collection_id?: string
  blob_id: string
  data_asset_id: string
  data_type: string
  region?: string
  epoch?: string
  shard_content_hash?: string
  contributor_root?: string
  authorization_root?: string
  accounting_root?: string
  total_contributors?: number
  total_events?: number
  contributor_count?: number
}

type PricingRecord = {
  owner_id: string
  data_type: string
  quality_score: number
  price_micro_usdc: number
  signals?: { event_count?: number }
}

type PricingReport = {
  generated_at?: string
  assets: PricingRecord[]
}

type SealKeyRecord = {
  user_id?: string
  shard_id?: string
  data_asset_id: string
  blob_id: string
  encrypted_key_b64?: string
  encryption_iv?: string
  encryption_auth_tag?: string
}

type MarketplaceSources = {
  manifest: UploadManifestRecord[]
  registry: DataAssetRegistryRecord[]
  pricing?: PricingReport
  sealKeys?: SealKeyRecord[]
}

const appRoot = process.cwd()
const projectRoot =
  path.basename(appRoot) === "mars-marketplace-design" ? path.resolve(appRoot, "..") : appRoot

const sourcePaths = {
  manifest: path.join(projectRoot, "walrus-uploader/output/upload_manifest.json"),
  registry: path.join(projectRoot, "contracts/output/data_asset_registry.json"),
  pricing: path.join(projectRoot, "ai-pricing/output/pricing_report.json"),
  sealKeys: path.join(projectRoot, "seal-access/output/seal_key_registry.json"),
}

const readJson = async <T,>(filePath: string): Promise<T> =>
  JSON.parse(await readFile(filePath, "utf8")) as T

const readOptionalJson = async <T,>(filePath: string): Promise<T | undefined> => {
  try {
    return await readJson<T>(filePath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined
    throw error
  }
}

const PRODUCT_META: Record<string, { name: string; type: string; tags: string[] }> = {
  consumer_behavior: {
    name: "Consumer Behavior Dataset",
    type: "Consumer Behavior",
    tags: ["Demand Prediction", "Inventory AI", "Consumer Analytics"],
  },
  merchant_operations: {
    name: "Merchant Operations Dataset",
    type: "Retail Operations",
    tags: ["Operations AI", "Demand Forecasting", "Menu AI"],
  },
  rider_mobility: {
    name: "Rider Mobility Dataset",
    type: "Mobility & Transportation",
    tags: ["ETA Prediction", "Dispatch Optimization", "Mobility Modeling"],
  },
}

export const marketplaceProductSlugs = Object.keys(PRODUCT_META)

const title = (value?: string) =>
  value ? value.replaceAll("_", " ").replace(/\b\w/g, (char) => char.toUpperCase()) : ""

const bytesToDisplaySize = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "Unknown"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex++
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

const loadSources = async (): Promise<MarketplaceSources | undefined> => {
  const [manifest, registry, pricing, sealKeys] = await Promise.all([
    readOptionalJson<UploadManifestRecord[]>(sourcePaths.manifest),
    readOptionalJson<DataAssetRegistryRecord[]>(sourcePaths.registry),
    readOptionalJson<PricingReport>(sourcePaths.pricing),
    readOptionalJson<SealKeyRecord[]>(sourcePaths.sealKeys),
  ])
  if (!manifest?.length || !registry?.length) return undefined
  return { manifest, registry, pricing, sealKeys }
}

const buildShardDataset = async (
  upload: UploadManifestRecord,
  sources: MarketplaceSources,
): Promise<Dataset | undefined> => {
  const dataType = upload.data_type
  const meta = PRODUCT_META[dataType]
  if (!meta) return undefined

  const assets: DatasetAsset[] = []
  let totalBytes = 0
  const uploadId = upload.shard_id ?? upload.user_id
  const datasetId = dataType

  const reg = sources.registry.find(
    r => (r.shard_id ?? r.user_id) === uploadId && r.blob_id === upload.blob_id,
  )
  if (!reg) return undefined

  const pricing = sources.pricing?.assets.find(
    p => p.owner_id === uploadId && p.data_type === upload.data_type,
  )
  const sealKey = sources.sealKeys?.find(k => k.data_asset_id === reg.data_asset_id)
  const priceMicroUsdc = pricing?.price_micro_usdc ?? 0

  try {
    const encryptedName = upload.shard_id ? `${upload.shard_id}.json.gz.enc` : `${upload.user_id}.bin`
    const file = path.join(projectRoot, "walrus-uploader/output/encrypted", encryptedName)
    totalBytes += (await stat(file)).size
  } catch { /* ignore */ }

  assets.push({
    dataAssetObjectId: reg.data_asset_id,
    walrusBlobId: upload.blob_id,
    encryptedKeyB64: sealKey?.encrypted_key_b64 ?? "",
    encryptionIv: sealKey?.encryption_iv ?? upload.encryption?.iv ?? "",
    encryptionAuthTag: sealKey?.encryption_auth_tag ?? upload.encryption?.auth_tag ?? "",
    priceMicroUsdc,
  })

  const label = [meta.name, title(upload.region), upload.epoch].filter(Boolean).join(" - ")
  const first = assets[0]

  return {
    id: datasetId,
    name: label,
    type: meta.type,
    qualityScore: pricing?.quality_score ?? 0,
    price: priceMicroUsdc / 1_000_000,
    priceMicroUsdc,
    contributorCount: upload.contributor_count ?? upload.contributors.length,
    useCaseTags: meta.tags,
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: assets.some(a => a.encryptedKeyB64 !== ""),
    walrusBlobId: first.walrusBlobId,
    dataAssetObjectId: first.dataAssetObjectId,
    lastUpdated: upload.walrus?.uploaded_at || new Date().toISOString(),
    datasetSize: bytesToDisplaySize(totalBytes),
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: first.encryptedKeyB64,
    encryptionIv: first.encryptionIv,
    encryptionAuthTag: first.encryptionAuthTag,
    assets,
  }
}

export const getMarketplaceDatasets = async (): Promise<Dataset[]> => {
  const sources = await loadSources()
  if (!sources) return sampleDatasets

  const products = await Promise.all(
    sources.manifest.map((upload) => buildShardDataset(upload, sources)),
  )

  const live = products.filter((p): p is Dataset => p !== undefined)
  return live.length > 0 ? live : sampleDatasets
}

export const getMarketplaceDatasetById = async (id: string): Promise<Dataset | undefined> => {
  const datasets = await getMarketplaceDatasets()
  return datasets.find(d => d.id === id || d.id.startsWith(`${id}__`) || id.startsWith(`${d.id}__`))
}
