export const SUI_NETWORK = "testnet" as const

const requireEnv = (key: string): string => {
  const value = process.env[key]
  if (!value) throw new Error(`Missing env var ${key} — copy .env.local.example to .env.local and fill in the values`)
  return value
}

export const MARS_PACKAGE_ID = requireEnv("NEXT_PUBLIC_MARS_PACKAGE_ID")

export const SEAL_PACKAGE_ID = process.env.NEXT_PUBLIC_SEAL_PACKAGE_ID ?? ""

export const USDC_COIN_TYPE = `${MARS_PACKAGE_ID}::usdc::USDC` as const

export const SUI_CLOCK_OBJECT_ID = "0x6"

export const SEAL_KEY_SERVER = {
  objectId: "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  aggregatorUrl: "https://seal-aggregator-testnet.mystenlabs.com",
  weight: 1,
} as const

export const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space"
