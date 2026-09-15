import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

// Pumper Launchpad (pumper.tools) on Stable -- every token launched through it
// gets its own Uniswap V3 pool, created via the SAME shared, third-party V3
// factory every other project on Stable also uses for its own pools (it is
// NOT a Pumper-owned/deployed factory -- its owner() is an unrelated address,
// confirmed on-chain). Isolating Pumper's own pools therefore can't go
// through that factory's PoolCreated events (that picks up every project's
// pools) or getUniV3LogAdapter's `factory:` option (same problem).
//
// The correct, isolated pool set instead comes from PumperProtocolRegistry
// (0x7Cd190e5Ba34C1Ec8FE07F78EddB026719940492, deployed block 32938134): every
// launchpad generation calls `registry.register(token, creator, pool)` inside
// its own `launch()` (see Contracts/src/PumperLaunchpad.sol), and the
// registry is the one thing that survives every launchpad redeploy. Scanning
// ITS `TokenRegistered` event log gives exactly and only the pools Pumper's
// own launchpad(s) created, across every generation, with nothing else mixed
// in -- and correctly EXCLUDES PUMPER's own PUMPER/WgUSDT pool too, since
// PUMPER (the platform's governance token) was never launched THROUGH
// `launch()` (a separate relaunch/airdrop deployment), so it was never
// registered here either, as it shouldn't be for a launchpad-specific metric.
//
// NOT using getUniV3LogAdapter/filterPools for the volume/fee leg either,
// despite using it for pool discovery being the obvious first instinct:
// filterPools (helpers/uniswap.ts) requires >= $200 of CURRENT pooled value
// before a pool counts at all, with no config knob to lower or bypass it.
// Every Pumper launch seeds ONE-SIDED liquidity with ZERO paired asset at
// launch (see PumperLaunchpad.sol's `launch()`) -- a pool's WgUSDT-side
// balance only grows as buyers swap into it, so CURRENT liquidity stays thin
// even on a pool with substantial cumulative trading volume. Verified
// locally: all real launchpad pools were silently filtered to zero by this
// threshold even on a day with ~$28k of real, confirmed platform volume
// (Pumper's own /api/stats/overview). So this fetch is self-contained,
// mirroring the already-live openlaunch.ts adapter's own custom fetchV2
// rather than routing through the shared helper.
//
// There's no separate bonding-curve escrow contract holding funds -- every
// launch's value lives in the standard V3 pool itself, which is why this is
// a Fees & Revenue adapter, not a TVL one (that value is already inside
// standard Uniswap V3 pool contracts; counting it again here would
// double-count against however Stable's own DEX TVL is tracked).
const REGISTRY = "0x7Cd190e5Ba34C1Ec8FE07F78EddB026719940492";
const REGISTRY_DEPLOY_BLOCK = 32938134;
const TOKEN_REGISTERED_EVENT =
  "event TokenRegistered(address indexed token, address indexed creator, address pool, address indexed launchpad)";
const WGUSDT = "0x817997Ca8394E26CCE3dE3A076a4889b27DbF9dE";
const V3_SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

// Fee tier is fixed at 1% (10_000) for every Pumper-launched pool
// (PumperLaunchpad.sol, `FEE_TIER = 10_000`) -- hardcoded rather than read
// per-pool since it's a verified, immutable protocol constant, not something
// that could vary launch to launch.
const FEE_FRACTION = 0.01;

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
const ADMIN_VAULT_RATIO = 0.10;
const PROTOCOL_SIDE_RATIO = 0.10 + 0.05 + 0.05; // admin + fefer + pumper vaults

const fetch: FetchV2 = async (options: FetchOptions) => {
  const { getLogs, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();

  const registeredLogs: any[] = await getLogs({
    target: REGISTRY,
    eventAbi: TOKEN_REGISTERED_EVENT,
    fromBlock: REGISTRY_DEPLOY_BLOCK,
    flatten: true,
    cacheInCloud: true,
  });

  // token0/token1 for each pool: Pumper always pairs the launched token
  // against WgUSDT, sorted by address the same way Uniswap V3 itself does.
  const pairObject: Record<string, [string, string]> = {};
  for (const log of registeredLogs) {
    const token = (log.token as string).toLowerCase();
    const pool = (log.pool as string).toLowerCase();
    pairObject[pool] = token < WGUSDT.toLowerCase() ? [token, WGUSDT] : [WGUSDT, token];
  }
  const pools = Object.keys(pairObject);
  if (!pools.length) {
    return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: 0, dailyProtocolRevenue: 0 };
  }

  const allLogs = await getLogs({ targets: pools, eventAbi: V3_SWAP_EVENT, flatten: false });
  allLogs.forEach((logs: any[], i: number) => {
    if (!logs?.length) return;
    const pool = pools[i];
    const [token0, token1] = pairObject[pool];
    logs.forEach((log: any) => {
      const { token: feeToken, amount: feeAmount } = addOneToken({
        chain: CHAIN.STABLE,
        balances: dailyFees,
        token0,
        token1,
        amount0: Number(log.amount0) * FEE_FRACTION,
        amount1: Number(log.amount1) * FEE_FRACTION,
        label: "Swap Fees",
      });
      dailyRevenue.add(feeToken, feeAmount * PROTOCOL_SIDE_RATIO);
      dailySupplySideRevenue.add(feeToken, feeAmount * (1 - PROTOCOL_SIDE_RATIO));
      dailyProtocolRevenue.add(feeToken, feeAmount * ADMIN_VAULT_RATIO);
    });
  });

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.STABLE],
  fetch,
  start: "2026-07-01",
  methodology: {
    Fees: "Swap fees paid by users on Uniswap V3 pools for tokens launched through Pumper Launchpad (fixed 1% fee tier), discovered from PumperProtocolRegistry's TokenRegistered events -- isolated to pools Pumper's own launchpad created, not the shared Uniswap V3 factory's other pools.",
    Revenue: "The protocol-side cut taken on each fee harvest: ADMIN_VAULT_BPS (10%) + FEFER_VAULT_BPS (5%) + PUMPER_VAULT_BPS (5%) of swap fees, per PumperLaunchpad.sol's fixed constants.",
    ProtocolRevenue: "ADMIN_VAULT_BPS alone (10% of swap fees) -- the pure protocol-treasury slice of Revenue, paid to adminVault.",
    SupplySideRevenue: "The remaining 80% of swap fees, split between each launched token's stakers/holders and its creator in a ratio the creator sets per token (holderShareBps) -- not further broken out here since it varies per token.",
  },
  pullHourly: true,
  doublecounted: true, // stableswap
};

export default adapter;
