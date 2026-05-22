/// Fee split and payment distribution for completed Mars orders.
///
/// Called after confirm_completed (or resolve_dispute ruling=1) has set
/// order.state = Completed. Drains the escrow balance and routes shares to
/// merchant and rider.
///
/// Split constants (basis points, must sum to 10 000):
///   Merchant  — 85 %
///   Rider     — 15 % (receives remainder, absorbs rounding dust)
module mars::settlement {
    use sui::balance;
    use sui::coin;
    use mars::escrow::{Self, Order};
    use mars::usdc::USDC;

    // ── Constants ────────────────────────────────────────────────────────────
    const MERCHANT_BPS: u64 = 8_500; // 85 % to the merchant
    const RIDER_BPS: u64    = 1_500; // 15 % to the rider (receives remainder, absorbs rounding dust)

    // ── Error codes ──────────────────────────────────────────────────────────
    const EOrderNotCompleted: u64 = 1; // order.state must be Completed
    const EZeroAmount: u64        = 2; // nothing to settle

    // ── Functions ────────────────────────────────────────────────────────────

    /// Splits the order escrow between merchant (85 %) and rider (15 %) and transfers each.
    ///
    /// Permissionless — any party can trigger settlement once the order is Completed.
    /// Calling twice is safe: the second call hits EZeroAmount because the balance is drained.
    public fun settle_order(
        order: &mut Order,
        ctx: &mut TxContext,
    ) {
        // Only settle orders that have reached the terminal Completed state.
        assert!(escrow::is_completed(escrow::order_state(order)), EOrderNotCompleted);

        let total = escrow::amount_value(order);
        assert!(total > 0, EZeroAmount);

        // Drain the entire escrow balance out of the Order object.
        let mut escrow_balance = escrow::take_amount(order);

        // ── Merchant share (85 %) ─────────────────────────────────────────
        let merchant_share = (((total as u128) * (MERCHANT_BPS as u128)) / 10_000) as u64;
        let merchant_coin = coin::from_balance(
            balance::split(&mut escrow_balance, merchant_share),
            ctx,
        );
        transfer::public_transfer(merchant_coin, escrow::merchant(order));

        // ── Rider share (remainder ≈ 15 %, absorbs rounding dust) ─────────
        // Consuming escrow_balance directly — rider gets whatever remains.
        let rider_coin = coin::from_balance(escrow_balance, ctx);
        transfer::public_transfer(rider_coin, escrow::rider(order));

        let _ = RIDER_BPS; // documented split; rider receives remainder rather than a calculated split
    }
}
