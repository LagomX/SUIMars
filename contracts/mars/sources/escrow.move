/// Order lifecycle and USDC escrow for Mars delivery.
///
/// State machine:
///   Created → Paid → Accepted → (Preparing →) PickedUp → Delivered → Completed
///                                                                   ↘ Disputed → (Cancelled | Completed)
///   Created | Paid → Cancelled  (customer cancels before acceptance)
module mars::escrow {
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::clock::Clock;
    use mars::usdc::USDC;

    // ── Error codes ──────────────────────────────────────────────────────────
    const EInvalidState: u64         = 1;
    const ENotCustomer: u64          = 2;
    const ENotMerchant: u64          = 3;
    const ENotRider: u64             = 4;
    const EZeroPayment: u64          = 5;
    const EDisputeWindowExpired: u64 = 6;
    const EInvalidRuling: u64        = 7;

    /// 24 hours expressed in milliseconds (Sui Clock ticks in ms).
    const DISPUTE_WINDOW_MS: u64      = 86_400_000;
    const AUTO_COMPLETE_DELAY_MS: u64 = 86_400_000;

    // ── Capability ───────────────────────────────────────────────────────────

    /// Owned by the deployer or a secured operations wallet. Required for
    /// resolve_dispute and AI-agent writes across all modules in this package.
    /// For MVP this remains transferable, so operational custody matters.
    public struct AdminCap has key, store {
        id: UID,
    }

    // ── Order state machine ──────────────────────────────────────────────────

    public enum OrderState has copy, drop, store {
        Created,
        Paid,
        Accepted,
        Preparing,   // optional intermediate: merchant is actively preparing
        PickedUp,
        Delivered,
        Completed,
        Cancelled,
        Disputed,
    }

    // ── Order object ─────────────────────────────────────────────────────────

    public struct Order has key {
        id: UID,
        customer: address,
        merchant: address,
        rider: address,          // @0x0 until pickup_order is called
        amount: Balance<USDC>,   // USDC held in escrow
        state: OrderState,
        data_asset: Option<ID>,  // linked after DataAsset is registered for this order
        created_at: u64,
        delivered_at: Option<u64>,
    }

    // ── Module initialiser ───────────────────────────────────────────────────

    fun init(ctx: &mut TxContext) {
        // Deployer receives the one AdminCap at package publication.
        transfer::transfer(AdminCap { id: object::new(ctx) }, ctx.sender());
    }

    // ── Public entry functions ───────────────────────────────────────────────

    /// Customer creates a new order for a given merchant.
    /// The Order is shared immediately so all parties can interact with it.
    public fun create_order(
        merchant: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let order = Order {
            id: object::new(ctx),
            customer: ctx.sender(),
            merchant,
            rider: @0x0,
            amount: balance::zero(),
            state: OrderState::Created,
            data_asset: option::none(),
            created_at: clock.timestamp_ms(),
            delivered_at: option::none(),
        };
        transfer::share_object(order);
    }

    /// Customer locks USDC into the order escrow.
    /// Transitions: Created → Paid.
    public fun pay_order(
        order: &mut Order,
        payment: Coin<USDC>,
        ctx: &mut TxContext,
    ) {
        assert!(
            match (order.state) { OrderState::Created => true, _ => false },
            EInvalidState,
        );
        assert!(ctx.sender() == order.customer, ENotCustomer);
        assert!(payment.value() > 0, EZeroPayment);
        balance::join(&mut order.amount, coin::into_balance(payment));
        order.state = OrderState::Paid;
    }

    /// Merchant confirms they will fulfill the order.
    /// Transitions: Paid → Accepted.
    public fun accept_order(order: &mut Order, ctx: &mut TxContext) {
        assert!(
            match (order.state) { OrderState::Paid => true, _ => false },
            EInvalidState,
        );
        assert!(ctx.sender() == order.merchant, ENotMerchant);
        order.state = OrderState::Accepted;
    }

    /// Merchant signals active preparation (optional step).
    /// Transitions: Accepted → Preparing.
    public fun start_preparing(order: &mut Order, ctx: &mut TxContext) {
        assert!(
            match (order.state) { OrderState::Accepted => true, _ => false },
            EInvalidState,
        );
        assert!(ctx.sender() == order.merchant, ENotMerchant);
        order.state = OrderState::Preparing;
    }

    /// Any rider picks up the order; their address is recorded as order.rider.
    /// Transitions: Accepted | Preparing → PickedUp.
    public fun pickup_order(order: &mut Order, ctx: &mut TxContext) {
        assert!(
            match (order.state) {
                OrderState::Accepted | OrderState::Preparing => true,
                _ => false,
            },
            EInvalidState,
        );
        order.rider = ctx.sender();
        order.state = OrderState::PickedUp;
    }

    /// Rider marks the delivery complete and starts the 24-hour dispute window.
    /// Transitions: PickedUp → Delivered.
    public fun mark_delivered(
        order: &mut Order,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            match (order.state) { OrderState::PickedUp => true, _ => false },
            EInvalidState,
        );
        assert!(ctx.sender() == order.rider, ENotRider);
        order.state = OrderState::Delivered;
        order.delivered_at = option::some(clock.timestamp_ms());
    }

    /// Customer confirms receipt — or anyone calls after the 24-hour auto-complete window.
    /// Transitions: Delivered → Completed.
    public fun confirm_completed(
        order: &mut Order,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            match (order.state) { OrderState::Delivered => true, _ => false },
            EInvalidState,
        );
        let delivered_at = *order.delivered_at.borrow();
        let is_customer = ctx.sender() == order.customer;
        let window_passed = clock.timestamp_ms() >= delivered_at + AUTO_COMPLETE_DELAY_MS;
        assert!(is_customer || window_passed, ENotCustomer);
        order.state = OrderState::Completed;
    }

    /// Customer cancels before the order is accepted. Any locked USDC is refunded.
    /// Transitions: Created | Paid → Cancelled.
    public fun cancel_order(order: &mut Order, ctx: &mut TxContext) {
        assert!(
            match (order.state) {
                OrderState::Created | OrderState::Paid => true,
                _ => false,
            },
            EInvalidState,
        );
        assert!(ctx.sender() == order.customer, ENotCustomer);
        order.state = OrderState::Cancelled;
        // Return any locked USDC to the customer.
        let refund = balance::withdraw_all(&mut order.amount);
        if (balance::value(&refund) > 0) {
            transfer::public_transfer(coin::from_balance(refund, ctx), order.customer);
        } else {
            balance::destroy_zero(refund);
        };
    }

    /// Customer raises a dispute within the 24-hour window after delivery.
    /// Freezes funds until resolve_dispute is called by admin.
    /// Transitions: Delivered → Disputed.
    public fun raise_dispute(
        order: &mut Order,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(
            match (order.state) { OrderState::Delivered => true, _ => false },
            EInvalidState,
        );
        assert!(ctx.sender() == order.customer, ENotCustomer);
        let delivered_at = *order.delivered_at.borrow();
        // Strict < so the dispute window closes before the auto-complete window opens.
        // Using <= would allow raise_dispute and confirm_completed to both succeed
        // at exactly delivered_at + DISPUTE_WINDOW_MS (same block, undefined ordering).
        assert!(
            clock.timestamp_ms() < delivered_at + DISPUTE_WINDOW_MS,
            EDisputeWindowExpired,
        );
        order.state = OrderState::Disputed;
    }

    /// Admin resolves a dispute.
    ///   ruling = 0 → customer wins, USDC refunded, order Cancelled.
    ///   ruling = 1 → merchant/rider win, order moves to Completed for settlement.
    /// Transitions: Disputed → Cancelled | Completed.
    public fun resolve_dispute(
        _cap: &AdminCap,
        order: &mut Order,
        ruling: u8,
        ctx: &mut TxContext,
    ) {
        assert!(
            match (order.state) { OrderState::Disputed => true, _ => false },
            EInvalidState,
        );
        assert!(ruling == 0 || ruling == 1, EInvalidRuling);
        if (ruling == 0) {
            order.state = OrderState::Cancelled;
            let refund = balance::withdraw_all(&mut order.amount);
            transfer::public_transfer(coin::from_balance(refund, ctx), order.customer);
        } else {
            // Merchant/rider win — settlement.move will distribute funds.
            order.state = OrderState::Completed;
        };
    }

    // ── Package-internal functions ───────────────────────────────────────────

    /// Links a DataAsset ID to this order once the delivery data has been uploaded.
    public(package) fun link_data_asset(order: &mut Order, asset_id: ID) {
        order.data_asset = option::some(asset_id);
    }

    /// Drains the full escrow balance so settlement.move can distribute it.
    public(package) fun take_amount(order: &mut Order): Balance<USDC> {
        balance::withdraw_all(&mut order.amount)
    }

    // ── Test-only helpers ────────────────────────────────────────────────────

    /// Invoke the module initialiser in a test scenario so the deployer address
    /// receives an AdminCap just as a real package publication would.
    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(ctx);
    }

    // ── Read-only accessors ───────────────────────────────────────────────────

    public fun order_state(order: &Order): OrderState { order.state }
    public fun customer(order: &Order): address        { order.customer }
    public fun merchant(order: &Order): address        { order.merchant }
    public fun rider(order: &Order): address           { order.rider }
    public fun amount_value(order: &Order): u64        { balance::value(&order.amount) }

    public fun is_completed(state: OrderState): bool {
        match (state) { OrderState::Completed => true, _ => false }
    }
}
