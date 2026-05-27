/// On-chain registry for encrypted delivery datasets stored in Walrus.
///
/// Flow:
///   1. Frontend encrypts data client-side and uploads to Walrus → gets blob_id.
///   2. Caller invokes register_data_asset with blob_id + contributors.
///   3. AI Agent calls set_quality_and_price (requires AdminCap).
///   4. Contributor calls set_for_sale(true) to list the asset.
///   5. AI buyer calls data_license::purchase_access → reward_pool fills.
///   6. Anyone calls distribute_reward to pay contributors by weight.
module mars::data_asset {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use mars::usdc::USDC;
    use mars::escrow::AdminCap;

    // ── Error codes ──────────────────────────────────────────────────────────
    const ENoContributors: u64      = 1;
    const EInvalidWeights: u64      = 2; // weights must sum to exactly 10 000 bps
    const ENotContributor: u64      = 3;
    const EEmptyRewardPool: u64     = 4;
    const EInvalidQualityScore: u64 = 5; // score must be 0–100
    const EEmptyBlobId: u64         = 6; // blob_id must be non-empty
    const EEmptyDataType: u64       = 7; // data_type must be non-empty

    // ── Structs ──────────────────────────────────────────────────────────────

    /// One party's share in a DataAsset's revenue.
    public struct Contributor has store, copy, drop {
        addr: address,
        role: vector<u8>,   // "rider" | "merchant" | "consumer"
        weight_bps: u64,    // basis points; all contributors in one asset must sum to 10 000
    }

    /// On-chain record anchoring an encrypted Walrus blob to its contributor owners.
    public struct DataAsset has key {
        id: UID,
        contributors: vector<Contributor>,
        blob_id: vector<u8>,        // Walrus blob identifier (bytes returned by Walrus SDK)
        data_type: vector<u8>,      // "rider_mobility" | "merchant_operations" | "consumer_behavior"
        quality_score: u64,         // 0–100; written by AI Agent after analysing the blob
        price_usdc: Option<u64>,    // None until AI Agent calls set_quality_and_price
        for_sale: bool,             // contributor toggles this to list the asset for AI purchase
        reward_pool: Balance<USDC>, // USDC accumulates here from AI purchases
        created_at: u64,
    }

    // ── Constructor helper ────────────────────────────────────────────────────

    /// Build a Contributor value off-chain in a PTB, then pass the vector to register_data_asset.
    public fun new_contributor(
        addr: address,
        role: vector<u8>,
        weight_bps: u64,
    ): Contributor {
        Contributor { addr, role, weight_bps }
    }

    // ── Entry functions ──────────────────────────────────────────────────────

    /// Register a new DataAsset after the encrypted blob has been uploaded to Walrus.
    /// The asset is shared so the AI Agent and future buyers can interact with it.
    ///
    /// Preconditions:
    ///   - contributors must be non-empty
    ///   - sum of contributor weight_bps must equal exactly 10 000
    public fun register_data_asset(
        blob_id: vector<u8>,
        contributors: vector<Contributor>,
        data_type: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(vector::length(&blob_id) > 0, EEmptyBlobId);
        assert!(vector::length(&data_type) > 0, EEmptyDataType);
        assert!(vector::length(&contributors) > 0, ENoContributors);
        assert!(sum_weights(&contributors) == 10_000, EInvalidWeights);

        let asset = DataAsset {
            id: object::new(ctx),
            contributors,
            blob_id,
            data_type,
            quality_score: 0,
            price_usdc: option::none(),
            for_sale: false,
            reward_pool: balance::zero(),
            created_at: clock.timestamp_ms(),
        };
        transfer::share_object(asset);
    }

    /// AI Agent writes the quality score and suggested USDC listing price on-chain.
    /// Requires AdminCap — only the agent wallet (holding AdminCap) may call this.
    public fun set_quality_and_price(
        _cap: &AdminCap,
        asset: &mut DataAsset,
        score: u64,
        price: u64,
        _ctx: &mut TxContext,
    ) {
        assert!(score <= 100, EInvalidQualityScore);
        asset.quality_score = score;
        asset.price_usdc = option::some(price);
    }

    /// Any contributor may list or delist the asset for AI purchase.
    /// Typically called after reviewing the AI Agent's quality score and price suggestion.
    public fun set_for_sale(
        asset: &mut DataAsset,
        for_sale: bool,
        ctx: &mut TxContext,
    ) {
        assert!(contains_contributor(&asset.contributors, ctx.sender()), ENotContributor);
        asset.for_sale = for_sale;
    }

    /// Deposit USDC into the asset's reward pool.
    /// Only purchase_access should fund the pool, so every deposit has a license record.
    public(package) fun add_to_reward_pool(asset: &mut DataAsset, payment: Coin<USDC>, _ctx: &mut TxContext) {
        balance::join(&mut asset.reward_pool, coin::into_balance(payment));
    }

    /// Split the accumulated reward_pool among contributors proportional to weight_bps.
    /// Permissionless — anyone can trigger distribution once funds exist.
    /// The last contributor receives any rounding dust.
    public fun distribute_reward(asset: &mut DataAsset, ctx: &mut TxContext) {
        let total = balance::value(&asset.reward_pool);
        assert!(total > 0, EEmptyRewardPool);

        let len = vector::length(&asset.contributors);

        // Distribute calculated shares to all contributors except the last.
        let mut i = 0u64;
        while (i < len - 1) {
            let contributor = vector::borrow(&asset.contributors, i);
            let share = (((total as u128) * (contributor.weight_bps as u128)) / 10_000) as u64;
            if (share > 0) {
                let payout = coin::from_balance(
                    balance::split(&mut asset.reward_pool, share),
                    ctx,
                );
                transfer::public_transfer(payout, contributor.addr);
            };
            i = i + 1;
        };

        // Last contributor gets the remainder to absorb integer rounding dust.
        let last_addr = vector::borrow(&asset.contributors, len - 1).addr;
        let remainder = balance::withdraw_all(&mut asset.reward_pool);
        if (balance::value(&remainder) > 0) {
            transfer::public_transfer(coin::from_balance(remainder, ctx), last_addr);
        } else {
            balance::destroy_zero(remainder);
        };
    }

    // ── Read-only accessors ───────────────────────────────────────────────────

    public fun is_for_sale(asset: &DataAsset): bool        { asset.for_sale }
    public fun get_price(asset: &DataAsset): Option<u64>   { asset.price_usdc }
    public fun quality_score(asset: &DataAsset): u64       { asset.quality_score }
    public fun blob_id(asset: &DataAsset): &vector<u8>     { &asset.blob_id }
    public fun reward_pool_value(asset: &DataAsset): u64   { balance::value(&asset.reward_pool) }

    // ── Private helpers ───────────────────────────────────────────────────────

    /// Returns true if addr matches any contributor in the vector.
    fun contains_contributor(contributors: &vector<Contributor>, addr: address): bool {
        let len = vector::length(contributors);
        let mut i = 0u64;
        while (i < len) {
            if (vector::borrow(contributors, i).addr == addr) {
                return true
            };
            i = i + 1;
        };
        false
    }

    /// Sums weight_bps across all contributors.
    fun sum_weights(contributors: &vector<Contributor>): u64 {
        let len = vector::length(contributors);
        let mut total = 0u64;
        let mut i = 0u64;
        while (i < len) {
            total = total + vector::borrow(contributors, i).weight_bps;
            i = i + 1;
        };
        total
    }
}
