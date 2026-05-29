export interface DatasetAsset {
  dataAssetObjectId: string
  walrusBlobId: string
  encryptedKeyB64: string
  encryptionIv: string
  encryptionAuthTag: string
  priceMicroUsdc: number
}

export interface Dataset {
  id: string
  name: string
  type: string
  qualityScore: number
  price: number
  priceMicroUsdc: number
  contributorCount: number
  useCaseTags: string[]
  isEncrypted: boolean
  walrusStatus: "active" | "syncing" | "archived"
  sealProtected: boolean
  walrusBlobId: string
  dataAssetObjectId: string
  lastUpdated: string
  datasetSize: string
  licenseStatus: string
  encryptedKeyB64: string
  encryptionIv: string
  encryptionAuthTag: string
  assets: DatasetAsset[]
}

export const sampleDatasets: Dataset[] = [
  {
    id: "consumer_behavior",
    name: "Consumer Behavior Dataset",
    type: "Consumer Behavior",
    qualityScore: 89,
    price: 44,
    priceMicroUsdc: 0,
    contributorCount: 500,
    useCaseTags: ["Demand Prediction", "Inventory AI", "Consumer Analytics"],
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: true,
    walrusBlobId: "",
    dataAssetObjectId: "",
    lastUpdated: new Date().toISOString(),
    datasetSize: "~11 MB",
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: "",
    encryptionIv: "",
    encryptionAuthTag: "",
    assets: [],
  },
  {
    id: "merchant_operations",
    name: "Merchant Operations Dataset",
    type: "Retail Operations",
    qualityScore: 91,
    price: 3.52,
    priceMicroUsdc: 0,
    contributorCount: 40,
    useCaseTags: ["Operations AI", "Demand Forecasting", "Menu AI"],
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: true,
    walrusBlobId: "",
    dataAssetObjectId: "",
    lastUpdated: new Date().toISOString(),
    datasetSize: "~900 KB",
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: "",
    encryptionIv: "",
    encryptionAuthTag: "",
    assets: [],
  },
  {
    id: "rider_mobility",
    name: "Rider Mobility Dataset",
    type: "Mobility & Transportation",
    qualityScore: 94,
    price: 8.80,
    priceMicroUsdc: 0,
    contributorCount: 100,
    useCaseTags: ["ETA Prediction", "Dispatch Optimization", "Mobility Modeling"],
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: true,
    walrusBlobId: "",
    dataAssetObjectId: "",
    lastUpdated: new Date().toISOString(),
    datasetSize: "~2.2 MB",
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: "",
    encryptionIv: "",
    encryptionAuthTag: "",
    assets: [],
  },
]

export function getDatasetById(id: string): Dataset | undefined {
  return sampleDatasets.find(d => d.id === id)
}
