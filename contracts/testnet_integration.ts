/**
 * SUIMars testnet integration tests — no mocks, no simulators.
 *
 * Every assertion runs against real testnet objects via Sui RPC.
 * The active Sui CLI wallet is used for admin/buyer transactions.
 * consumer_001's key signs the set_for_sale contributor tx.
 *
 * Run: pnpm test:testnet
 */
import assert from "node:assert/strict"
import path from "node:path"
import dotenv from "dotenv"
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client"
import type { SuiTransactionBlockResponse } from "@mysten/sui/client"
import type { Keypair } from "@mysten/sui/cryptography"
import { Transaction } from "@mysten/sui/transactions"
import { loadSigner, signerFromPrivateKey } from "./suiUtils"

dotenv.config({ path: path.join(__dirname, ".env") })

// ── Testnet deployment constants ───────────────────────────────────────────────

const PACKAGE_ID = "0x32201b4b767ac91d40234e87c58ea7e8a68e06653dc23a6eba84e4adca6ad613"
const DATA_ASSET_ID = "0x2c71aa186fe94f8029a8207b55fc33b4051f87923df8b498b5227f87c910cdf1"
const WALRUS_BLOB_ID = "-jCptvlR5lincAiVxeWiGjmzzK7XF4k5HeK2n3Zo_tg"
const TREASURY_CAP_ID = "0xbd4fb752932de4a6ec5864b340377290a3dbee497cbdc0843f2283da47085107"
const ADMIN_CAP_ID = "0xaef04eadd7f51d9ec100d3acd354e5efbb02e9a0bd970fce291d9bfe8ffaa623"
// consumer_001 holds a contributor share in DATA_ASSET_ID — needed for set_for_sale
const OWNER_PRIVATE_KEY = "suiprivkey1qzslev2qyzfcv472tn2wpqjvvt6lfcvksu3fx52yeuz9y9f9u7gcuzsytnl"
const QUALITY_SCORE = 88n
const PRICE_MICRO_USDC = 88000n
const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space"

// ── Test runner ────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  process.stdout.write(`  ${name} ... `)
  try {
    await fn()
    console.log("PASS")
    passed++
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.log(`FAIL\n    ${msg}`)
    failed++
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const hexToBytes = (hex: string): number[] =>
  Array.from(Buffer.from(hex.replace(/^0x/, ""), "hex"))

const execute = async (
  client: SuiClient,
  signer: Keypair,
  tx: Transaction,
): Promise<SuiTransactionBlockResponse> => {
  const result = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  })
  if (result.effects?.status.status !== "success") {
    throw new Error(result.effects?.status.error ?? "Sui tx failed")
  }
  // Wait for the RPC node to index the tx before callers read created objects.
  await client.waitForTransaction({ digest: result.digest })
  return result
}

const findCreated = (
  objectChanges: SuiTransactionBlockResponse["objectChanges"],
  typeSuffix: string,
): string => {
  const found = (objectChanges ?? []).find((c) => {
    return c.type === "created" && "objectType" in c && c.objectType.endsWith(typeSuffix)
  }) as { objectId?: string } | undefined
  if (!found?.objectId) throw new Error(`No created *${typeSuffix} in tx output`)
  return found.objectId
}

const ensureGas = async (
  client: SuiClient,
  funder: Keypair,
  recipient: string,
): Promise<void> => {
  const balance = await client.getBalance({ owner: recipient })
  if (BigInt(balance.totalBalance) >= 5_000_000n) return
  // Funder wallet is low on SUI — send a small amount (30 MIST ≈ 0.03 SUI)
  const funderBalance = await client.getBalance({ owner: funder.getPublicKey().toSuiAddress() })
  const available = BigInt(funderBalance.totalBalance)
  const sendAmount = available > 60_000_000n ? 30_000_000n : available / 3n
  if (sendAmount <= 0n) throw new Error("Funder has no SUI to cover owner gas — request testnet SUI from https://faucet.sui.io")
  const tx = new Transaction()
  const [coin] = tx.splitCoins(tx.gas, [tx.pure.u64(sendAmount)])
  tx.transferObjects([coin], tx.pure.address(recipient))
  await execute(client, funder, tx)
  console.log(`    Funded ${recipient.slice(0, 12)}… with ${sendAmount} MIST for gas`)
}

// ── Main ───────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
  const client = new SuiClient({ url: getFullnodeUrl("testnet") })
  const adminSigner = await loadSigner(process.env.SUI_PRIVATE_KEY)
  const ownerSigner = signerFromPrivateKey(OWNER_PRIVATE_KEY)
  const buyerAddress = adminSigner.getPublicKey().toSuiAddress()
  const ownerAddress = ownerSigner.getPublicKey().toSuiAddress()

  console.log(`\nSUIMars Testnet Integration Tests`)
  console.log(`Buyer:      ${buyerAddress}`)
  console.log(`Owner:      ${ownerAddress}`)
  console.log(`DataAsset:  ${DATA_ASSET_ID}`)
  console.log(`Package:    ${PACKAGE_ID}\n`)

  // Fund owner wallet if below gas threshold so set_for_sale can be signed.
  await ensureGas(client, adminSigner, ownerAddress)

  // Shared state across tests — populated by the purchase test.
  let licenseId = ""

  // ── Test 1 ─────────────────────────────────────────────────────────────────

  await test("DataAsset exists on testnet with correct Move type", async () => {
    const obj = await client.getObject({ id: DATA_ASSET_ID, options: { showType: true } })
    assert.ok(obj.data, `DataAsset ${DATA_ASSET_ID} not found on testnet`)
    assert.ok(
      obj.data.type?.includes("::data_asset::DataAsset"),
      `Unexpected type: ${obj.data.type}`,
    )
  })

  // ── Test 2 ─────────────────────────────────────────────────────────────────

  await test("set_quality_and_price via AdminCap writes price and score", async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::data_asset::set_quality_and_price`,
      arguments: [
        tx.object(ADMIN_CAP_ID),
        tx.object(DATA_ASSET_ID),
        tx.pure.u64(QUALITY_SCORE),
        tx.pure.u64(PRICE_MICRO_USDC),
      ],
    })
    await execute(client, adminSigner, tx)
  })

  // ── Test 3 ─────────────────────────────────────────────────────────────────

  await test("set_for_sale by contributor (owner signer) lists the asset", async () => {
    const tx = new Transaction()
    tx.moveCall({
      target: `${PACKAGE_ID}::data_asset::set_for_sale`,
      arguments: [tx.object(DATA_ASSET_ID), tx.pure.bool(true)],
    })
    await execute(client, ownerSigner, tx)
  })

  // ── Test 4 ─────────────────────────────────────────────────────────────────

  await test("DataAsset on-chain state: for_sale=true, price_usdc set", async () => {
    const obj = await client.getObject({
      id: DATA_ASSET_ID,
      options: { showContent: true },
    })
    assert.ok(obj.data, "DataAsset not found")
    const content = obj.data.content as { fields?: Record<string, unknown> } | undefined
    const fields = content?.fields
    assert.ok(fields, "DataAsset has no content fields")
    assert.strictEqual(fields.for_sale, true, `for_sale=${fields.for_sale}`)
    assert.ok(
      fields.price_usdc !== null && fields.price_usdc !== undefined,
      "price_usdc is None — set_quality_and_price may not have confirmed yet",
    )
  })

  // ── Test 5 ─────────────────────────────────────────────────────────────────

  await test("purchase_access mints a DataLicense NFT on testnet", async () => {
    const tx = new Transaction()
    // Mint exactly PRICE_MICRO_USDC TestUSDC using the admin's TreasuryCap, then purchase.
    const payment = tx.moveCall({
      target: `${PACKAGE_ID}::usdc::mint_for_testing`,
      arguments: [tx.object(TREASURY_CAP_ID), tx.pure.u64(PRICE_MICRO_USDC)],
    })
    tx.moveCall({
      target: `${PACKAGE_ID}::data_license::purchase_access`,
      arguments: [tx.object(DATA_ASSET_ID), payment, tx.object.clock()],
    })
    const result = await execute(client, adminSigner, tx)
    licenseId = findCreated(result.objectChanges, "::data_license::DataLicense")
    assert.ok(licenseId.startsWith("0x"), `Invalid DataLicense ID: ${licenseId}`)
    console.log(`\n    DataLicense: ${licenseId}`)
  })

  // ── Test 6 ─────────────────────────────────────────────────────────────────

  await test("DataLicense fields: buyer, data_asset_id, usdc_paid correct", async () => {
    assert.ok(licenseId, "licenseId not set — purchase test must pass first")
    const obj = await client.getObject({ id: licenseId, options: { showContent: true } })
    assert.ok(obj.data, `DataLicense ${licenseId} not found`)
    const fields = (obj.data.content as { fields?: Record<string, unknown> })?.fields
    assert.ok(fields, "DataLicense has no content fields")

    assert.strictEqual(
      (fields.buyer as string)?.toLowerCase(),
      buyerAddress.toLowerCase(),
      `buyer mismatch: ${fields.buyer}`,
    )
    assert.strictEqual(
      BigInt(fields.usdc_paid as string),
      PRICE_MICRO_USDC,
      `usdc_paid=${fields.usdc_paid}`,
    )

    // `data_asset_id` is an ID (struct wrapping address); Sui RPC may render
    // it as a hex string or as { id: "0x..." } depending on version.
    const rawId = fields.data_asset_id
    const assetId =
      typeof rawId === "string"
        ? rawId
        : `0x${(rawId as { id?: string })?.id ?? ""}`
    assert.strictEqual(
      assetId.toLowerCase(),
      DATA_ASSET_ID.toLowerCase(),
      `data_asset_id=${assetId}`,
    )
  })

  // ── Test 7 ─────────────────────────────────────────────────────────────────

  await test("seal_approve devInspect succeeds for buyer's DataLicense", async () => {
    assert.ok(licenseId, "licenseId not set — purchase test must pass first")
    // Build the same PTB that SealClient sends to the key server for dry-run.
    // ctx.sender() in devInspect is buyerAddress, matching license.buyer.
    const tx = new Transaction()
    tx.setSender(buyerAddress)
    tx.moveCall({
      target: `${PACKAGE_ID}::data_license::seal_approve`,
      arguments: [
        // id must be the raw BCS bytes of object::id(asset) = 32 raw bytes from hex
        tx.pure.vector("u8", hexToBytes(DATA_ASSET_ID)),
        tx.object(licenseId),
        tx.object(DATA_ASSET_ID),
      ],
    })
    const result = await client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: buyerAddress,
    })
    assert.strictEqual(
      result.effects.status.status,
      "success",
      `seal_approve aborted: ${result.effects.status.error ?? JSON.stringify(result.error ?? {})}`,
    )
  })

  // ── Test 8 ─────────────────────────────────────────────────────────────────

  await test("Walrus encrypted blob is accessible via testnet aggregator", async () => {
    const url = `${WALRUS_AGGREGATOR}/v1/blobs/${WALRUS_BLOB_ID}`
    const resp = await fetch(url)
    assert.ok(resp.ok, `HTTP ${resp.status} fetching Walrus blob ${WALRUS_BLOB_ID.slice(0, 12)}…`)
    const bytes = await resp.arrayBuffer()
    assert.ok(bytes.byteLength > 0, "Walrus blob returned empty body")
  })

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(`\n${"─".repeat(60)}`)
  console.log(`Results: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error("\nFatal:", err instanceof Error ? err.message : String(err))
  process.exit(1)
})
