export const SUI_NETWORK = "testnet" as const

export const MARS_PACKAGE_ID =
  "0x32201b4b767ac91d40234e87c58ea7e8a68e06653dc23a6eba84e4adca6ad613"

export const SEAL_PACKAGE_ID =
  "0x4debd417b55934090560e79b5153fdb2729d0aebf6cd097aff52de0ba6bd8c70"

export const USDC_COIN_TYPE = `${MARS_PACKAGE_ID}::usdc::USDC` as const

export const SUI_CLOCK_OBJECT_ID = "0x6"

export const SEAL_KEY_SERVER = {
  objectId: "0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98",
  aggregatorUrl: "https://seal-aggregator-testnet.mystenlabs.com",
  weight: 1,
} as const

export const WALRUS_AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space"
