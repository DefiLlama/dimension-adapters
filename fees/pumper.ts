import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter } from "../helpers/uniswap";

// Pumper Launchpad (pumper.tools) on Stable -- every token launched through it
// gets its own Uniswap V3 pool, created via this ONE factory, seeded
// one-sided (100% of supply, no paired asset) so price is discovered entirely
// by buys/sells against that pool. There's no separate bonding-curve escrow
// contract holding funds -- trading value lives in the V3 pools themselves,
// which is why this is a Fees & Revenue adapter, not a TVL one (that value is
// already inside standard Uniswap V3 pool contracts; counting it again here
// would double-count against however Stable's own DEX TVL is tracked).
//
// Fee tier is fixed at 1% (10_000) for every Pumper-launched pool
// (PumperLaunchpad.sol, `FEE_TIER = 10_000`) -- getUniV3LogAdapter reads each
// pool's own configured fee, so this doesn't need to hardcode that, it just
// happens to always come out the same here.
//
// Revenue split, on every `collectLpFees` harvest (PumperLaunchpad.sol,
// fixed protocol constants, never per-token-configurable):
//   ADMIN_VAULT_BPS  = 10% -> adminVault (pure protocol treasury)
//   FEFER_VAULT_BPS  =  5% -> feferVault
//   PUMPER_VAULT_BPS =  5% -> pumperVault
//   remainder        = 80% -> split between the token's stakers/holders and
//                             its creator, in a ratio the CREATOR sets per
//                             token (`holderShareBps`) -- not a fixed
//                             protocol-wide constant, so it isn't broken out
//                             into its own dailyHoldersRevenue line here.
const PUMPER_V3_FACTORY = "0x88F0a512eF09175D456bc9547f914f48C013E4aA";
const ADMIN_VAULT_RATIO = 0.10;
const PROTOCOL_SIDE_RATIO = 0.10 + 0.05 + 0.05; // admin + fefer + pumper vaults

const fetch = getUniV3LogAdapter({
  factory: PUMPER_V3_FACTORY,
  revenueRatio: PROTOCOL_SIDE_RATIO,
  protocolRevenueRatio: ADMIN_VAULT_RATIO,
});

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.STABLE],
  fetch,
  start: "2026-07-01",
  methodology: {
    Fees: "Swap fees paid by users on every Pumper-launched token's Uniswap V3 pool (fixed 1% fee tier), discovered via the shared PumperLaunchpad V3 factory's PoolCreated events.",
    Revenue: "The protocol-side cut taken on each fee harvest: ADMIN_VAULT_BPS (10%) + FEFER_VAULT_BPS (5%) + PUMPER_VAULT_BPS (5%) of swap fees, per PumperLaunchpad.sol's fixed constants.",
    ProtocolRevenue: "ADMIN_VAULT_BPS alone (10% of swap fees) -- the pure protocol-treasury slice of Revenue, paid to adminVault.",
    SupplySideRevenue: "The remaining 80% of swap fees, split between each launched token's stakers/holders and its creator in a ratio the creator sets per token (holderShareBps) -- not further broken out here since it varies per token.",
  },
};

export default adapter;
