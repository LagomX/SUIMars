/// Unit tests for Mars financial logic.
///
/// Coverage:
///   data_asset   — register_data_asset, distribute_reward (even split, rounding dust, single contributor)
///   data_license — purchase_access (happy path, wrong amount, unlisted, no price)
///   settlement   — settle_order (85/15 split, rounding dust, zero-amount guard)
///   escrow       — resolve_dispute (ruling=0 refund, ruling=1 completes, invalid ruling)
///
/// Run from contracts/mars/:
///   sui move test
#[test_only]
module mars::mars_tests {
    use std::bcs;
    use sui::test_scenario::{Self as ts, Scenario};
    use sui::coin::{Self, Coin};
    use sui::clock::{Self, Clock};
    use sui::balance;
    use mars::usdc::{Self, USDC};
    use mars::data_asset::{Self, DataAsset};
    use mars::data_license::{Self, DataLicense};
    use mars::escrow::{Self, Order, AdminCap};
    use mars::settlement;

    // ── Test addresses ──────────────────────────────────────────────────────────
    const ADMIN:    address = @0xA0;
    const RIDER:    address = @0xB1;
    const MERCHANT: address = @0xB2;
    const CONSUMER: address = @0xB3;
    const BUYER:    address = @0xC0;

    // ── Helpers ─────────────────────────────────────────────────────────────────

    /// Mint raw USDC balance for tests (no TreasuryCap required — test-only helper).
    fun mint_usdc(amount: u64, ctx: &mut TxContext): Coin<USDC> {
        coin::from_balance(balance::create_for_testing<USDC>(amount), ctx)
    }

    /// Call escrow::init so the ADMIN address receives an AdminCap.
    /// Must be the first transaction in any scenario that uses AdminCap.
    fun init_modules(scenario: &mut Scenario) {
        ts::next_tx(scenario, ADMIN);
        {
            escrow::init_for_testing(ts::ctx(scenario));
        };
    }

    /// Build a single-contributor DataAsset owned by `addr` and share it.
    fun register_single_contributor_asset(
        scenario: &mut Scenario,
        owner: address,
    ) {
        ts::next_tx(scenario, owner);
        {
            let clock = clock::create_for_testing(ts::ctx(scenario));
            let contributor = data_asset::new_contributor(
                owner,
                b"rider",
                10_000, // 100 % weight
            );
            data_asset::register_data_asset(
                b"test_blob_id",
                vector[contributor],
                b"rider_mobility",
                &clock,
                ts::ctx(scenario),
            );
            clock::destroy_for_testing(clock);
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // data_asset :: distribute_reward
    // ═══════════════════════════════════════════════════════════════════════════

    #[test]
    /// Two contributors each with 50 % weight → each receives exactly half the pool.
    fun test_distribute_reward_even_split() {
        let mut scenario = ts::begin(ADMIN);

        // Register a DataAsset with two equal contributors.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let c1 = data_asset::new_contributor(RIDER,    b"rider",    5_000);
            let c2 = data_asset::new_contributor(MERCHANT, b"merchant", 5_000);
            data_asset::register_data_asset(
                b"blob_two_contributors",
                vector[c1, c2],
                b"rider_mobility",
                &clock,
                ts::ctx(&mut scenario),
            );
            clock::destroy_for_testing(clock);
        };

        // Inject 1000 USDC into the reward pool via add_to_reward_pool.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            let payment = mint_usdc(1_000, ts::ctx(&mut scenario));
            data_asset::add_to_reward_pool(&mut asset, payment, ts::ctx(&mut scenario));
            assert!(data_asset::reward_pool_value(&asset) == 1_000, 0);
            ts::return_shared(asset);
        };

        // distribute_reward — permissionless call.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            data_asset::distribute_reward(&mut asset, ts::ctx(&mut scenario));
            assert!(data_asset::reward_pool_value(&asset) == 0, 1);
            ts::return_shared(asset);
        };

        // Each contributor receives 500 USDC.
        ts::next_tx(&mut scenario, RIDER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 500, 2);
            ts::return_to_sender(&scenario, coin);
        };

        ts::next_tx(&mut scenario, MERCHANT);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 500, 3);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    /// Three contributors (40 % / 30 % / 30 %) with an odd pool amount.
    /// Integer division dust must end up with the last contributor — not lost.
    fun test_distribute_reward_rounding_dust() {
        let mut scenario = ts::begin(ADMIN);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let c1 = data_asset::new_contributor(RIDER,    b"rider",    4_000);
            let c2 = data_asset::new_contributor(MERCHANT, b"merchant", 3_000);
            let c3 = data_asset::new_contributor(CONSUMER, b"consumer", 3_000);
            data_asset::register_data_asset(
                b"blob_three_contributors",
                vector[c1, c2, c3],
                b"rider_mobility",
                &clock,
                ts::ctx(&mut scenario),
            );
            clock::destroy_for_testing(clock);
        };

        // Pool = 7 USDC (odd amount to force rounding).
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            let payment = mint_usdc(7, ts::ctx(&mut scenario));
            data_asset::add_to_reward_pool(&mut asset, payment, ts::ctx(&mut scenario));
            ts::return_shared(asset);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            data_asset::distribute_reward(&mut asset, ts::ctx(&mut scenario));
            // Pool fully drained — no USDC stranded on-chain.
            assert!(data_asset::reward_pool_value(&asset) == 0, 0);
            ts::return_shared(asset);
        };

        // Rider: floor(7 * 4000 / 10000) = floor(2.8) = 2
        ts::next_tx(&mut scenario, RIDER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 2, 1);
            ts::return_to_sender(&scenario, coin);
        };

        // Merchant: floor(7 * 3000 / 10000) = floor(2.1) = 2
        ts::next_tx(&mut scenario, MERCHANT);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 2, 2);
            ts::return_to_sender(&scenario, coin);
        };

        // Consumer (last): gets remainder = 7 - 2 - 2 = 3 (absorbs 1 unit of dust).
        ts::next_tx(&mut scenario, CONSUMER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 3, 3);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    /// Single contributor with 100 % weight receives the entire pool as remainder.
    fun test_distribute_reward_single_contributor() {
        let mut scenario = ts::begin(ADMIN);
        register_single_contributor_asset(&mut scenario, RIDER);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            let payment = mint_usdc(500, ts::ctx(&mut scenario));
            data_asset::add_to_reward_pool(&mut asset, payment, ts::ctx(&mut scenario));
            data_asset::distribute_reward(&mut asset, ts::ctx(&mut scenario));
            assert!(data_asset::reward_pool_value(&asset) == 0, 0);
            ts::return_shared(asset);
        };

        ts::next_tx(&mut scenario, RIDER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 500, 1);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_asset::EEmptyRewardPool)]
    /// distribute_reward aborts when the pool is empty.
    fun test_distribute_reward_empty_pool_aborts() {
        let mut scenario = ts::begin(ADMIN);
        register_single_contributor_asset(&mut scenario, RIDER);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            data_asset::distribute_reward(&mut asset, ts::ctx(&mut scenario)); // must abort
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // data_license :: purchase_access
    // ═══════════════════════════════════════════════════════════════════════════

    /// Set up a DataAsset ready for purchase: quality+price set, listed for sale.
    /// Caller must have already invoked init_modules so ADMIN holds an AdminCap.
    fun setup_listed_asset(scenario: &mut Scenario, price: u64) {
        // Register asset.
        register_single_contributor_asset(scenario, RIDER);

        // Admin sets quality and price.
        ts::next_tx(scenario, ADMIN);
        {
            let cap     = ts::take_from_sender<AdminCap>(scenario);
            let mut asset = ts::take_shared<DataAsset>(scenario);
            data_asset::set_quality_and_price(&cap, &mut asset, 90, price, ts::ctx(scenario));
            ts::return_to_sender(scenario, cap);
            ts::return_shared(asset);
        };

        // Rider lists the asset.
        ts::next_tx(scenario, RIDER);
        {
            let mut asset = ts::take_shared<DataAsset>(scenario);
            data_asset::set_for_sale(&mut asset, true, ts::ctx(scenario));
            ts::return_shared(asset);
        };
    }

    #[test]
    /// Happy path: buyer sends exact payment → DataLicense minted, pool funded.
    fun test_purchase_access_happy_path() {
        let price = 1_000_000u64; // 1 USDC (6 decimals)
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        setup_listed_asset(&mut scenario, price);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut asset   = ts::take_shared<DataAsset>(&scenario);
            let payment      = mint_usdc(price, ts::ctx(&mut scenario));
            let clock        = clock::create_for_testing(ts::ctx(&mut scenario));
            data_license::purchase_access(&mut asset, payment, &clock, ts::ctx(&mut scenario));
            // Pool credited.
            assert!(data_asset::reward_pool_value(&asset) == price, 0);
            clock::destroy_for_testing(clock);
            ts::return_shared(asset);
        };

        // DataLicense delivered to buyer.
        ts::next_tx(&mut scenario, BUYER);
        {
            let license = ts::take_from_sender<DataLicense>(&scenario);
            assert!(data_license::buyer(&license) == BUYER, 1);
            assert!(data_license::usdc_paid(&license) == price, 2);
            assert!(data_license::is_perpetual(&license), 3);
            ts::return_to_sender(&scenario, license);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_license::EWrongPaymentAmount)]
    /// Under-payment aborts.
    fun test_purchase_access_wrong_amount_aborts() {
        let price = 1_000_000u64;
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        setup_listed_asset(&mut scenario, price);

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut asset   = ts::take_shared<DataAsset>(&scenario);
            let payment      = mint_usdc(price - 1, ts::ctx(&mut scenario)); // wrong!
            let clock        = clock::create_for_testing(ts::ctx(&mut scenario));
            data_license::purchase_access(&mut asset, payment, &clock, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_license::ENotForSale)]
    /// Purchase fails when asset is not listed.
    fun test_purchase_access_not_for_sale_aborts() {
        let price = 500u64;
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        register_single_contributor_asset(&mut scenario, RIDER);

        // Set price but do NOT call set_for_sale.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let cap       = ts::take_from_sender<AdminCap>(&scenario);
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            data_asset::set_quality_and_price(&cap, &mut asset, 80, price, ts::ctx(&mut scenario));
            ts::return_to_sender(&scenario, cap);
            ts::return_shared(asset);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            let payment    = mint_usdc(price, ts::ctx(&mut scenario));
            let clock      = clock::create_for_testing(ts::ctx(&mut scenario));
            data_license::purchase_access(&mut asset, payment, &clock, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_license::ENoPriceSet)]
    /// Purchase fails when AI Agent has not set a price yet.
    fun test_purchase_access_no_price_set_aborts() {
        let mut scenario = ts::begin(ADMIN);
        register_single_contributor_asset(&mut scenario, RIDER);

        // List the asset without setting a price.
        ts::next_tx(&mut scenario, RIDER);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            data_asset::set_for_sale(&mut asset, true, ts::ctx(&mut scenario));
            ts::return_shared(asset);
        };

        ts::next_tx(&mut scenario, BUYER);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            let payment    = mint_usdc(100, ts::ctx(&mut scenario));
            let clock      = clock::create_for_testing(ts::ctx(&mut scenario));
            data_license::purchase_access(&mut asset, payment, &clock, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // settlement :: settle_order
    // ═══════════════════════════════════════════════════════════════════════════

    /// Create an order, pay it, accept it, pick it up, deliver it, confirm it.
    /// Returns the funded + Completed order ready for settlement.
    fun create_completed_order(scenario: &mut Scenario, amount: u64) {
        // Create order (CONSUMER → MERCHANT).
        ts::next_tx(scenario, CONSUMER);
        {
            let clock = clock::create_for_testing(ts::ctx(scenario));
            escrow::create_order(MERCHANT, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
        };

        // Pay.
        ts::next_tx(scenario, CONSUMER);
        {
            let mut order  = ts::take_shared<Order>(scenario);
            let payment     = mint_usdc(amount, ts::ctx(scenario));
            escrow::pay_order(&mut order, payment, ts::ctx(scenario));
            ts::return_shared(order);
        };

        // Accept.
        ts::next_tx(scenario, MERCHANT);
        {
            let mut order = ts::take_shared<Order>(scenario);
            escrow::accept_order(&mut order, ts::ctx(scenario));
            ts::return_shared(order);
        };

        // Pick up (RIDER).
        ts::next_tx(scenario, RIDER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            escrow::pickup_order(&mut order, ts::ctx(scenario));
            ts::return_shared(order);
        };

        // Deliver.
        ts::next_tx(scenario, RIDER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            let clock      = clock::create_for_testing(ts::ctx(scenario));
            escrow::mark_delivered(&mut order, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(order);
        };

        // Confirm completed (by customer).
        ts::next_tx(scenario, CONSUMER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            let clock      = clock::create_for_testing(ts::ctx(scenario));
            escrow::confirm_completed(&mut order, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(order);
        };
    }

    #[test]
    /// settle_order with 1000 USDC → merchant 850, rider 150.
    fun test_settle_order_split() {
        let mut scenario = ts::begin(ADMIN);
        create_completed_order(&mut scenario, 1_000);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut order = ts::take_shared<Order>(&scenario);
            settlement::settle_order(&mut order, ts::ctx(&mut scenario));
            // Balance fully drained.
            assert!(escrow::amount_value(&order) == 0, 0);
            ts::return_shared(order);
        };

        // Merchant receives 85 %.
        ts::next_tx(&mut scenario, MERCHANT);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 850, 1);
            ts::return_to_sender(&scenario, coin);
        };

        // Rider receives remainder (150).
        ts::next_tx(&mut scenario, RIDER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 150, 2);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    /// Odd amount (1001 USDC): merchant gets floor(1001 * 0.85) = 850,
    /// rider gets remainder = 151 (absorbs 1 unit of dust from 15 % target of 150.15).
    fun test_settle_order_rounding_dust() {
        let mut scenario = ts::begin(ADMIN);
        create_completed_order(&mut scenario, 1_001);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut order = ts::take_shared<Order>(&scenario);
            settlement::settle_order(&mut order, ts::ctx(&mut scenario));
            assert!(escrow::amount_value(&order) == 0, 0);
            ts::return_shared(order);
        };

        ts::next_tx(&mut scenario, MERCHANT);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            // floor(1001 * 8500 / 10000) = floor(850.85) = 850
            assert!(coin::value(&coin) == 850, 1);
            ts::return_to_sender(&scenario, coin);
        };

        ts::next_tx(&mut scenario, RIDER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            // remainder = 1001 - 850 = 151
            assert!(coin::value(&coin) == 151, 2);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = settlement::EOrderNotCompleted)]
    /// settle_order aborts if order is not in Completed state.
    fun test_settle_order_not_completed_aborts() {
        let mut scenario = ts::begin(ADMIN);

        // Create order but only pay it (state = Paid, not Completed).
        ts::next_tx(&mut scenario, CONSUMER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            escrow::create_order(MERCHANT, &clock, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, CONSUMER);
        {
            let mut order = ts::take_shared<Order>(&scenario);
            let payment    = mint_usdc(100, ts::ctx(&mut scenario));
            escrow::pay_order(&mut order, payment, ts::ctx(&mut scenario));
            ts::return_shared(order);
        };

        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut order = ts::take_shared<Order>(&scenario);
            settlement::settle_order(&mut order, ts::ctx(&mut scenario)); // must abort
            ts::return_shared(order);
        };

        ts::end(scenario);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // escrow :: resolve_dispute
    // ═══════════════════════════════════════════════════════════════════════════

    /// Helper: create and bring an order to Disputed state.
    fun create_disputed_order(scenario: &mut Scenario, amount: u64) {
        // Create, pay, accept, pick up, deliver.
        ts::next_tx(scenario, CONSUMER);
        {
            let clock = clock::create_for_testing(ts::ctx(scenario));
            escrow::create_order(MERCHANT, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(scenario, CONSUMER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            let payment    = mint_usdc(amount, ts::ctx(scenario));
            escrow::pay_order(&mut order, payment, ts::ctx(scenario));
            ts::return_shared(order);
        };
        ts::next_tx(scenario, MERCHANT);
        {
            let mut order = ts::take_shared<Order>(scenario);
            escrow::accept_order(&mut order, ts::ctx(scenario));
            ts::return_shared(order);
        };
        ts::next_tx(scenario, RIDER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            escrow::pickup_order(&mut order, ts::ctx(scenario));
            ts::return_shared(order);
        };
        ts::next_tx(scenario, RIDER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            let clock      = clock::create_for_testing(ts::ctx(scenario));
            escrow::mark_delivered(&mut order, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(order);
        };

        // Consumer raises dispute within the window.
        ts::next_tx(scenario, CONSUMER);
        {
            let mut order = ts::take_shared<Order>(scenario);
            let clock      = clock::create_for_testing(ts::ctx(scenario)); // t = 0, within 24 h
            escrow::raise_dispute(&mut order, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(order);
        };
    }

    #[test]
    /// resolve_dispute ruling=0 → Cancelled, USDC refunded to customer.
    fun test_resolve_dispute_ruling_customer_wins() {
        let amount = 800u64;
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        create_disputed_order(&mut scenario, amount);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let cap       = ts::take_from_sender<AdminCap>(&scenario);
            let mut order = ts::take_shared<Order>(&scenario);
            escrow::resolve_dispute(&cap, &mut order, 0, ts::ctx(&mut scenario));
            // Escrow fully drained.
            assert!(escrow::amount_value(&order) == 0, 0);
            ts::return_to_sender(&scenario, cap);
            ts::return_shared(order);
        };

        // Customer receives full refund.
        ts::next_tx(&mut scenario, CONSUMER);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == amount, 1);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    /// resolve_dispute ruling=1 → Completed; order can subsequently be settled.
    fun test_resolve_dispute_ruling_merchant_wins() {
        let amount = 600u64;
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        create_disputed_order(&mut scenario, amount);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let cap       = ts::take_from_sender<AdminCap>(&scenario);
            let mut order = ts::take_shared<Order>(&scenario);
            escrow::resolve_dispute(&cap, &mut order, 1, ts::ctx(&mut scenario));
            // Funds still in escrow — settlement.settle_order drains them.
            assert!(escrow::amount_value(&order) == amount, 0);
            ts::return_to_sender(&scenario, cap);
            ts::return_shared(order);
        };

        // Settle after ruling=1 (order is now Completed).
        ts::next_tx(&mut scenario, ADMIN);
        {
            let mut order = ts::take_shared<Order>(&scenario);
            settlement::settle_order(&mut order, ts::ctx(&mut scenario));
            assert!(escrow::amount_value(&order) == 0, 1);
            ts::return_shared(order);
        };

        // Merchant receives 85 % of 600 = 510.
        ts::next_tx(&mut scenario, MERCHANT);
        {
            let coin = ts::take_from_sender<Coin<USDC>>(&scenario);
            assert!(coin::value(&coin) == 510, 2);
            ts::return_to_sender(&scenario, coin);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = escrow::EInvalidRuling)]
    /// resolve_dispute with an invalid ruling value aborts.
    fun test_resolve_dispute_invalid_ruling_aborts() {
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        create_disputed_order(&mut scenario, 100);

        ts::next_tx(&mut scenario, ADMIN);
        {
            let cap       = ts::take_from_sender<AdminCap>(&scenario);
            let mut order = ts::take_shared<Order>(&scenario);
            escrow::resolve_dispute(&cap, &mut order, 2, ts::ctx(&mut scenario)); // must abort
            ts::return_to_sender(&scenario, cap);
            ts::return_shared(order);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = escrow::EInvalidState)]
    /// resolve_dispute on a non-Disputed order (e.g. Paid) aborts.
    fun test_resolve_dispute_wrong_state_aborts() {
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);

        ts::next_tx(&mut scenario, CONSUMER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            escrow::create_order(MERCHANT, &clock, ts::ctx(&mut scenario));
            clock::destroy_for_testing(clock);
        };
        ts::next_tx(&mut scenario, CONSUMER);
        {
            let mut order = ts::take_shared<Order>(&scenario);
            let payment    = mint_usdc(100, ts::ctx(&mut scenario));
            escrow::pay_order(&mut order, payment, ts::ctx(&mut scenario));
            ts::return_shared(order);
        };

        // Order is Paid, not Disputed — resolve_dispute must abort.
        ts::next_tx(&mut scenario, ADMIN);
        {
            let cap       = ts::take_from_sender<AdminCap>(&scenario);
            let mut order = ts::take_shared<Order>(&scenario);
            escrow::resolve_dispute(&cap, &mut order, 0, ts::ctx(&mut scenario));
            ts::return_to_sender(&scenario, cap);
            ts::return_shared(order);
        };

        ts::end(scenario);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // data_license :: seal_approve  (Seal security gate)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Helper: purchase a DataLicense and return (data_asset_id, license_id) via
    /// the test scenario.  After this the buyer's inventory contains a DataLicense.
    fun purchase_license_for_buyer(scenario: &mut Scenario, price: u64) {
        // init_modules must already have been called by the test.
        setup_listed_asset(scenario, price);

        ts::next_tx(scenario, BUYER);
        {
            let mut asset = ts::take_shared<DataAsset>(scenario);
            let payment    = mint_usdc(price, ts::ctx(scenario));
            let clock      = clock::create_for_testing(ts::ctx(scenario));
            data_license::purchase_access(&mut asset, payment, &clock, ts::ctx(scenario));
            clock::destroy_for_testing(clock);
            ts::return_shared(asset);
        };
    }

    #[test]
    /// seal_approve: buyer presents a valid DataLicense for the correct DataAsset → no abort.
    fun test_seal_approve_valid_license_succeeds() {
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        purchase_license_for_buyer(&mut scenario, 500);

        ts::next_tx(&mut scenario, BUYER);
        {
            let asset   = ts::take_shared<DataAsset>(&scenario);
            let license = ts::take_from_sender<DataLicense>(&scenario);

            // Build the BCS identity bytes the Seal SDK would send:
            // bcs::to_bytes(&object::id(asset)) → raw 32-byte address of the asset.
            let asset_id = object::id(&asset);
            let id_bytes = bcs::to_bytes(&asset_id);

            // Must not abort — buyer holds a valid perpetual license for this asset.
            data_license::seal_approve(id_bytes, &license, &asset, ts::ctx(&mut scenario));

            ts::return_to_sender(&scenario, license);
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_license::EUnauthorized)]
    /// seal_approve: wrong asset ID (IBE identity mismatch) → EUnauthorized.
    /// Prevents a key encrypted for DataAsset A from being used to unlock DataAsset B.
    fun test_seal_approve_wrong_asset_id_aborts() {
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        purchase_license_for_buyer(&mut scenario, 500);

        ts::next_tx(&mut scenario, BUYER);
        {
            let asset   = ts::take_shared<DataAsset>(&scenario);
            let license = ts::take_from_sender<DataLicense>(&scenario);

            // Pass a deliberately wrong id_bytes (32 zero bytes ≠ any real object ID).
            let wrong_id = vector[
                0u8, 0, 0, 0, 0, 0, 0, 0,
                0u8, 0, 0, 0, 0, 0, 0, 0,
                0u8, 0, 0, 0, 0, 0, 0, 0,
                0u8, 0, 0, 0, 0, 0, 0, 0,
            ];

            // Must abort: id does not match bcs::to_bytes(object::id(asset)).
            data_license::seal_approve(wrong_id, &license, &asset, ts::ctx(&mut scenario));

            ts::return_to_sender(&scenario, license);
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_license::EUnauthorized)]
    /// seal_approve: a third party (not the license buyer) tries to use BUYER's license → EUnauthorized.
    /// ctx.sender() == MERCHANT ≠ license.buyer == BUYER.
    fun test_seal_approve_non_buyer_caller_aborts() {
        let mut scenario = ts::begin(ADMIN);
        init_modules(&mut scenario);
        purchase_license_for_buyer(&mut scenario, 500);

        // Transfer the license to MERCHANT so they physically hold it —
        // but the license.buyer field still records BUYER.
        ts::next_tx(&mut scenario, BUYER);
        {
            let license = ts::take_from_sender<DataLicense>(&scenario);
            // DataLicense has `has key` but not `has store`, so `transfer::transfer`
            // can only be called from within data_license.move itself.
            // Use the #[test_only] wrapper exported for exactly this purpose.
            data_license::transfer_for_testing(license, MERCHANT);
        };

        ts::next_tx(&mut scenario, MERCHANT);
        {
            let asset   = ts::take_shared<DataAsset>(&scenario);
            let license = ts::take_from_sender<DataLicense>(&scenario);

            let asset_id = object::id(&asset);
            let id_bytes = bcs::to_bytes(&asset_id);

            // Must abort: ctx.sender() == MERCHANT but license.buyer == BUYER.
            data_license::seal_approve(id_bytes, &license, &asset, ts::ctx(&mut scenario));

            ts::return_to_sender(&scenario, license);
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // data_asset :: register / set_for_sale  (new BUG-2 guards)
    // ═══════════════════════════════════════════════════════════════════════════

    #[test]
    #[expected_failure(abort_code = data_asset::EEmptyBlobId)]
    /// register_data_asset rejects an empty blob_id.
    fun test_register_data_asset_empty_blob_id_aborts() {
        let mut scenario = ts::begin(ADMIN);

        ts::next_tx(&mut scenario, RIDER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let contributor = data_asset::new_contributor(RIDER, b"rider", 10_000);
            data_asset::register_data_asset(
                b"",          // ← empty blob_id must abort
                vector[contributor],
                b"rider_mobility",
                &clock,
                ts::ctx(&mut scenario),
            );
            clock::destroy_for_testing(clock);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_asset::EEmptyDataType)]
    /// register_data_asset rejects an empty data_type.
    fun test_register_data_asset_empty_data_type_aborts() {
        let mut scenario = ts::begin(ADMIN);

        ts::next_tx(&mut scenario, RIDER);
        {
            let clock = clock::create_for_testing(ts::ctx(&mut scenario));
            let contributor = data_asset::new_contributor(RIDER, b"rider", 10_000);
            data_asset::register_data_asset(
                b"some_blob_id",
                vector[contributor],
                b"",          // ← empty data_type must abort
                &clock,
                ts::ctx(&mut scenario),
            );
            clock::destroy_for_testing(clock);
        };

        ts::end(scenario);
    }

    #[test]
    #[expected_failure(abort_code = data_asset::ENotContributor)]
    /// set_for_sale aborts when called by an address that is not a contributor.
    fun test_set_for_sale_non_contributor_aborts() {
        let mut scenario = ts::begin(ADMIN);
        register_single_contributor_asset(&mut scenario, RIDER);

        // MERCHANT is not a contributor of this DataAsset.
        ts::next_tx(&mut scenario, MERCHANT);
        {
            let mut asset = ts::take_shared<DataAsset>(&scenario);
            data_asset::set_for_sale(&mut asset, true, ts::ctx(&mut scenario)); // must abort
            ts::return_shared(asset);
        };

        ts::end(scenario);
    }
}
