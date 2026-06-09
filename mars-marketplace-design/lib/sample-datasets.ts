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

// Testnet artifacts — deployed 2026-06-09
// Package: 0xe6109124a4fd79a577eae339274a3150b0ecb11760af669f02debdf538d4a7d0
export const sampleDatasets: Dataset[] = [
  {
    id: "consumer_behavior",
    name: "Consumer Behavior Dataset",
    type: "Consumer Behavior",
    qualityScore: 88,
    price: 0.088,
    priceMicroUsdc: 88000,
    contributorCount: 500,
    useCaseTags: ["Demand Prediction", "Inventory AI", "Consumer Analytics"],
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: true,
    walrusBlobId: "h-DPMWCdUO-zL-Edj-A7hjhRpYHHNqBBUfJfyf7gvKc",
    dataAssetObjectId: "0x49bf2c59966e3dbcbb79b7dc97dcb4d48298f123fe4dc5c677974c56f27eb43e",
    lastUpdated: "2026-06-09T22:24:03.176Z",
    datasetSize: "364 KB",
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: "AOYQkSSk/Xmld+rjOSdKMVCw7LEXYK9mnwLevfU41KfQIEm/LFmWbj28u3m33JfctNSCmPEj/k3FxneXTFbyfrQ+AbASN4yfN5n7Wxpwg9p0pAaePD8ck94LJyEqV5nOHh6YAQEAsf3YQg/wltTeW9vmu1TgpegYh9yze0Dqu3nRjZzijwbdKrpd4Ug9OLH2rlkyngjUF+HrhK/aGeUGyYmZ52svmkDzYtd20pcOSWMJWpLrkvK30CVflq4IkAj+pyAZLUWIASCiGlBDbo9gAZ90Yms/p46wnLaDPgXz3DMvInqpBXMzYt9FmKOmoZxqu+vbrKsQxgLZoKcMTclkvSXU9shOgk0AMDgLgdQupZEPs92MR3aoVZQUYmc1TTsIPeQy7te3kaAEAWDGoDXv7ChfxMhWjpuLawEA",
    encryptionIv: "9bad4b55d4499e874b54c8c9",
    encryptionAuthTag: "9a3741d3b21986a9e46ac716f4d999ea",
    assets: [
      {
        dataAssetObjectId: "0x49bf2c59966e3dbcbb79b7dc97dcb4d48298f123fe4dc5c677974c56f27eb43e",
        walrusBlobId: "h-DPMWCdUO-zL-Edj-A7hjhRpYHHNqBBUfJfyf7gvKc",
        encryptedKeyB64: "AOYQkSSk/Xmld+rjOSdKMVCw7LEXYK9mnwLevfU41KfQIEm/LFmWbj28u3m33JfctNSCmPEj/k3FxneXTFbyfrQ+AbASN4yfN5n7Wxpwg9p0pAaePD8ck94LJyEqV5nOHh6YAQEAsf3YQg/wltTeW9vmu1TgpegYh9yze0Dqu3nRjZzijwbdKrpd4Ug9OLH2rlkyngjUF+HrhK/aGeUGyYmZ52svmkDzYtd20pcOSWMJWpLrkvK30CVflq4IkAj+pyAZLUWIASCiGlBDbo9gAZ90Yms/p46wnLaDPgXz3DMvInqpBXMzYt9FmKOmoZxqu+vbrKsQxgLZoKcMTclkvSXU9shOgk0AMDgLgdQupZEPs92MR3aoVZQUYmc1TTsIPeQy7te3kaAEAWDGoDXv7ChfxMhWjpuLawEA",
        encryptionIv: "9bad4b55d4499e874b54c8c9",
        encryptionAuthTag: "9a3741d3b21986a9e46ac716f4d999ea",
        priceMicroUsdc: 88000,
      },
    ],
  },
  {
    id: "merchant_operations",
    name: "Merchant Operations Dataset",
    type: "Retail Operations",
    qualityScore: 90,
    price: 0.108,
    priceMicroUsdc: 108000,
    contributorCount: 40,
    useCaseTags: ["Operations AI", "Demand Forecasting", "Menu AI"],
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: true,
    walrusBlobId: "9VGz7e2ArGuDIURhuW3bknLNkFRm4uAMliv2CpV8ciA",
    dataAssetObjectId: "0xedc6a06afd53c0a4c3f3deff06a88edc17ed9006036cb62763af774635a55304",
    lastUpdated: "2026-06-09T22:24:03.173Z",
    datasetSize: "195 KB",
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: "AOYQkSSk/Xmld+rjOSdKMVCw7LEXYK9mnwLevfU41KfQIO3GoGr9U8Ckw/Pe/waojtwX7ZAGA2y2J2Ovd0Y1pVMEAbASN4yfN5n7Wxpwg9p0pAaePD8ck94LJyEqV5nOHh6YAQEAi0KdKReaDF1LGGUWa7rPv9swk/3FP5wBFhNwsnlO66ntflBmQdQn3cKLJkEEb5CPBuvakTke/SXr9HQLw8LxQzyheHTJMdAFlKy7XFnwUF10Btnxa523zRd3w6KX8P70AU5MtdjYhwqY1eaxCC2GQMqpkla86R0o8q9BwApVGws3AUHArDScxY2P6dwgcTnhkDv1w2bNEXGvRmShYbT59FAAMBcqnGo7h7Gce1wBEFemjZEmAY/ARxBnMiQ3VqWG0A2Zda9cB2bpzD9P30+PHXJgxwEA",
    encryptionIv: "e5e71b284f14a9eb8c6d76fb",
    encryptionAuthTag: "bde2a3bc779ef7722a939ffab703a2e9",
    assets: [
      {
        dataAssetObjectId: "0xedc6a06afd53c0a4c3f3deff06a88edc17ed9006036cb62763af774635a55304",
        walrusBlobId: "9VGz7e2ArGuDIURhuW3bknLNkFRm4uAMliv2CpV8ciA",
        encryptedKeyB64: "AOYQkSSk/Xmld+rjOSdKMVCw7LEXYK9mnwLevfU41KfQIO3GoGr9U8Ckw/Pe/waojtwX7ZAGA2y2J2Ovd0Y1pVMEAbASN4yfN5n7Wxpwg9p0pAaePD8ck94LJyEqV5nOHh6YAQEAi0KdKReaDF1LGGUWa7rPv9swk/3FP5wBFhNwsnlO66ntflBmQdQn3cKLJkEEb5CPBuvakTke/SXr9HQLw8LxQzyheHTJMdAFlKy7XFnwUF10Btnxa523zRd3w6KX8P70AU5MtdjYhwqY1eaxCC2GQMqpkla86R0o8q9BwApVGws3AUHArDScxY2P6dwgcTnhkDv1w2bNEXGvRmShYbT59FAAMBcqnGo7h7Gce1wBEFemjZEmAY/ARxBnMiQ3VqWG0A2Zda9cB2bpzD9P30+PHXJgxwEA",
        encryptionIv: "e5e71b284f14a9eb8c6d76fb",
        encryptionAuthTag: "bde2a3bc779ef7722a939ffab703a2e9",
        priceMicroUsdc: 108000,
      },
    ],
  },
  {
    id: "rider_mobility",
    name: "Rider Mobility Dataset",
    type: "Mobility & Transportation",
    qualityScore: 90,
    price: 0.135,
    priceMicroUsdc: 135000,
    contributorCount: 100,
    useCaseTags: ["ETA Prediction", "Dispatch Optimization", "Mobility Modeling"],
    isEncrypted: true,
    walrusStatus: "active",
    sealProtected: true,
    walrusBlobId: "Tqevczm-ccjb5dkeWDG9WWX9qQTcqclITSARne2kHew",
    dataAssetObjectId: "0xfb105f92e2e296effa8a7777a146b4b1e9ad63107e2c862cc6e130a1ea32850a",
    lastUpdated: "2026-06-09T22:24:03.383Z",
    datasetSize: "1.0 MB",
    licenseStatus: "Commercial Use Allowed",
    encryptedKeyB64: "AOYQkSSk/Xmld+rjOSdKMVCw7LEXYK9mnwLevfU41KfQIPsQX5Li4pbv+op3d6FGtLHprWMQfiyGLMbhMKHqMoUKAbASN4yfN5n7Wxpwg9p0pAaePD8ck94LJyEqV5nOHh6YAQEApOMlLCkpbC1BjaaIAKvbo2/XmKfAGQ/QyYsy1Yo8RKfO2WfQoGxkyh5u8WyKENU5GTbm7JmXgSsC73Y6pOnVKoXNbb43+PyOXM+pA7eE6RnD1dmsIQEEukifzGU7e8ivAZjZGNLc2PodSns4+v4zZzO8JpgpcnyU/Ozq5VFaIOc+yycdlYoxBURdAH6SIHUaFLCcxxi75gygiiJl7xcjQCUAMA15lUaL+FtmFS7r8sHjgx3tbvqnAAXFxgqZNLo2BnG3qQiNvW2i7FIf7yIUf3hYNwEA",
    encryptionIv: "980cb461618cc3ea6d2c39ca",
    encryptionAuthTag: "bc27be5a00a91e31be237fc5597839ec",
    assets: [
      {
        dataAssetObjectId: "0xfb105f92e2e296effa8a7777a146b4b1e9ad63107e2c862cc6e130a1ea32850a",
        walrusBlobId: "Tqevczm-ccjb5dkeWDG9WWX9qQTcqclITSARne2kHew",
        encryptedKeyB64: "AOYQkSSk/Xmld+rjOSdKMVCw7LEXYK9mnwLevfU41KfQIPsQX5Li4pbv+op3d6FGtLHprWMQfiyGLMbhMKHqMoUKAbASN4yfN5n7Wxpwg9p0pAaePD8ck94LJyEqV5nOHh6YAQEApOMlLCkpbC1BjaaIAKvbo2/XmKfAGQ/QyYsy1Yo8RKfO2WfQoGxkyh5u8WyKENU5GTbm7JmXgSsC73Y6pOnVKoXNbb43+PyOXM+pA7eE6RnD1dmsIQEEukifzGU7e8ivAZjZGNLc2PodSns4+v4zZzO8JpgpcnyU/Ozq5VFaIOc+yycdlYoxBURdAH6SIHUaFLCcxxi75gygiiJl7xcjQCUAMA15lUaL+FtmFS7r8sHjgx3tbvqnAAXFxgqZNLo2BnG3qQiNvW2i7FIf7yIUf3hYNwEA",
        encryptionIv: "980cb461618cc3ea6d2c39ca",
        encryptionAuthTag: "bc27be5a00a91e31be237fc5597839ec",
        priceMicroUsdc: 135000,
      },
    ],
  },
]

export function getDatasetById(id: string): Dataset | undefined {
  return sampleDatasets.find(d => d.id === id)
}
