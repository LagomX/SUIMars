/// DataLicense minting and Seal access-control integration.
///
/// A DataLicense is minted on every successful AI purchase. It serves three purposes:
///   1. On-chain commercial license record (buyer, price, timestamp).
///   2. Payment proof — USDC was provably transferred to the reward pool.
///   3. Seal condition — Seal verifies the buyer owns a DataLicense for this
///      DataAsset before releasing the symmetric decryption key.
///
/// Note: once decrypted off-chain, blockchain cannot prevent copying. The DataLicense
/// provides legal provenance. Future versions will use TEE-based compute-to-data.
module mars::data_license {
    use std::bcs;
    use sui::clock::Clock;
    use sui::coin::Coin;
    use mars::usdc::USDC;
    use mars::data_asset::{Self, DataAsset};

    // ── Error codes ──────────────────────────────────────────────────────────
    const ENotForSale: u64          = 1; // asset.for_sale must be true
    const ENoPriceSet: u64          = 2; // AI Agent must call set_quality_and_price first
    const EWrongPaymentAmount: u64  = 3; // payment.value() must equal asset.price_usdc exactly
    const EUnauthorized: u64        = 4; // Seal gate: caller lacks a valid DataLicense

    // ── DataLicense struct ───────────────────────────────────────────────────

    /// Minted and transferred to the buyer on every successful data purchase.
    /// Seal reads this object's existence to decide whether to release the decryption key.
    public struct DataLicense has key {
        id: UID,
        data_asset_id: ID,      // which DataAsset was licensed
        buyer: address,         // AI company wallet that paid
        usdc_paid: u64,         // amount paid, recorded for audit
        purchased_at: u64,      // block timestamp (ms)
        license_type: vector<u8>, // "perpetual" for MVP; "subscription" in future
    }

    // ── Entry functions ──────────────────────────────────────────────────────

    /// AI company purchases access to a listed DataAsset.
    ///
    /// Steps:
    ///   1. Verify asset is listed (for_sale == true).
    ///   2. Verify AI Agent has set a price.
    ///   3. Verify payment equals price.
    ///   4. Route payment into asset.reward_pool for contributors to claim.
    ///   5. Mint a non-publicly-transferable DataLicense and transfer it to the buyer.
    #[allow(lint(self_transfer))]
    public fun purchase_access(
        asset: &mut DataAsset,
        payment: Coin<USDC>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // Asset must be listed by a contributor.
        assert!(data_asset::is_for_sale(asset), ENotForSale);

        // AI Agent must have set a price before purchase is possible.
        let price_opt = data_asset::get_price(asset);
        assert!(option::is_some(&price_opt), ENoPriceSet);
        let price = *option::borrow(&price_opt);

        // Buyer must send exactly the listed price — no overpayment, no underpayment.
        assert!(payment.value() == price, EWrongPaymentAmount);

        let usdc_paid = payment.value();

        // Entire payment goes into the contributor reward pool.
        data_asset::add_to_reward_pool(asset, payment, ctx);

        // Mint DataLicense and deliver it to the buyer's wallet.
        let license = DataLicense {
            id: object::new(ctx),
            data_asset_id: object::id(asset),
            buyer: ctx.sender(),
            usdc_paid,
            purchased_at: clock.timestamp_ms(),
            license_type: b"perpetual",
        };
        transfer::transfer(license, ctx.sender());
    }

    // ── Read-only accessors ───────────────────────────────────────────────────

    public fun buyer(license: &DataLicense): address            { license.buyer }
    public fun data_asset_id(license: &DataLicense): ID         { license.data_asset_id }
    public fun usdc_paid(license: &DataLicense): u64            { license.usdc_paid }
    public fun purchased_at(license: &DataLicense): u64         { license.purchased_at }
    public fun license_type(license: &DataLicense): &vector<u8> { &license.license_type }

    /// Required by data_asset::verify_license — returns the licensed asset's ID.
    public fun asset_id(license: &DataLicense): ID { license.data_asset_id }

    /// Returns true when the license grants perpetual (non-expiring) access.
    public fun is_perpetual(license: &DataLicense): bool {
        license.license_type == b"perpetual"
    }

    // ── Seal access-control helper ────────────────────────────────────────────

    /// Check whether a DataLicense grants access to a specific DataAsset.
    /// Seal uses DataLicense object ownership (buyer holds the object) for decryption
    /// key release; this function provides the on-chain condition check.
    ///
    /// Note: placed here (not in data_asset) to avoid a circular module dependency —
    /// data_license already imports DataAsset, so the check is expressed here without
    /// creating a dependency cycle.
    public fun verify_license(asset: &DataAsset, license: &DataLicense, requester: address): bool {
        license.data_asset_id == object::id(asset) &&
        license.buyer == requester &&
        license.license_type == b"perpetual"
    }

    // ── Test-only helpers ────────────────────────────────────────────────────

    /// Transfer a DataLicense to `recipient` for testing.
    /// `DataLicense` has `key` but not `store`, so `transfer::transfer` may only
    /// be called from within this module; tests in other modules use this wrapper.
    #[test_only]
    public fun transfer_for_testing(license: DataLicense, recipient: address) {
        transfer::transfer(license, recipient);
    }

    // ── Seal key-server gate ──────────────────────────────────────────────────

    /// Seal access-control function — aborts unless the caller may decrypt this DataAsset.
    ///
    /// Seal key servers invoke this function in a dry-run PTB before releasing the
    /// symmetric AES key that was registered with SealClient.encrypt.  The function
    /// MUST abort on any failed condition; a clean return means access is granted.
    ///
    /// Parameters:
    ///   id      — Seal IBE identity bytes, must equal bcs::to_bytes(object::id(asset)).
    ///             Prevents a key encrypted for DataAsset A from ever unlocking DataAsset B.
    ///   license — DataLicense owned by the buyer (object arg in the PTB).
    ///   asset   — Shared DataAsset being unlocked (shared object arg in the PTB).
    ///   ctx     — Transaction context; ctx.sender() is the buyer.
    ///
    /// Conditions (all must hold):
    ///   1. id == bcs::to_bytes(object::id(asset))    — IBE identity is bound to this asset.
    ///   2. license.data_asset_id == object::id(asset) — license is for this asset.
    ///   3. license.buyer == ctx.sender()              — license was issued to the caller.
    ///   4. license.license_type == b"perpetual"       — valid license type.
    ///
    /// How to call from a TypeScript PTB (after deploy):
    ///   const tx = new Transaction();
    ///   const assetIdBytes = fromHex(dataAssetObjectId); // 32-byte address
    ///   tx.moveCall({
    ///     target: `${PACKAGE_ID}::data_license::seal_approve`,
    ///     arguments: [
    ///       tx.pure.vector('u8', Array.from(assetIdBytes)),
    ///       tx.object(licenseObjectId),    // buyer-owned DataLicense
    ///       tx.object(dataAssetObjectId),  // shared DataAsset
    ///     ],
    ///   });
    ///   const txBytes = await tx.build({ client: suiClient });
    ///   // Pass txBytes to SealClient.decrypt({ data, sessionKey, txBytes })
    public fun seal_approve(
        id: vector<u8>,
        license: &DataLicense,
        asset: &DataAsset,
        ctx: &TxContext,
    ) {
        // Condition 1: guard against IBE identity confusion between different DataAssets.
        // bcs::to_bytes of an ID (which wraps an address) produces the raw 32 address bytes,
        // which matches what the TypeScript Seal SDK sends for a hex object-ID string.
        assert!(bcs::to_bytes(&object::id(asset)) == id, EUnauthorized);

        // Conditions 2–4: the caller must hold a valid DataLicense for this DataAsset.
        assert!(verify_license(asset, license, ctx.sender()), EUnauthorized);
    }
}
