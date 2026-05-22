/// Mock USDC coin for Mars testnet.
/// The deployer receives the TreasuryCap and uses mint_for_testing to seed test wallets.
module mars::usdc {
    use sui::coin;

    /// One-time witness — name must match module name in ALL_CAPS.
    public struct USDC has drop {}

    #[allow(deprecated_usage)]
    fun init(witness: USDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6,                          // 6 decimal places, matching real USDC
            b"TestUSDC",
            b"Test USD Coin",
            b"Mock USDC for Mars testnet",
            option::none(),
            ctx,
        );
        // Freeze metadata so symbol/name cannot be changed after deployment.
        transfer::public_freeze_object(metadata);
        // Deployer holds TreasuryCap to mint test tokens via scripts.
        transfer::public_transfer(treasury_cap, ctx.sender());
    }

    /// Mint test USDC. Only callable by whoever holds the TreasuryCap (deployer / seed scripts).
    public fun mint_for_testing(
        cap: &mut coin::TreasuryCap<USDC>,
        amount: u64,
        ctx: &mut TxContext,
    ): coin::Coin<USDC> {
        coin::mint(cap, amount, ctx)
    }
}
