import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

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
// Every Pumper launch pairs against one of these stablecoins (WgUSDT for the
// early launchpads, USDT0 from v9 on). Fees are measured on the stablecoin leg
// only: the pair is read from each pool's own token0()/token1() rather than
// assumed, since USDT0 (6dp) and WgUSDT (18dp) sort differently against the
// launched token -- assuming WgUSDT mislabelled raw 18dp token amounts as
// WgUSDT on pools like ELOJAK and inflated fees by orders of magnitude.
const QUOTE_ASSETS = new Set([
  "0x817997ca8394e26cce3de3a076a4889b27dbf9de", // WgUSDT
  "0x779ded0c9e1022225f8e0630b35a9b54be713736", // USDT0
]);
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
const FEFER_VAULT_RATIO = 0.05;
const PUMPER_VAULT_RATIO = 0.05;
const SUPPLY_SIDE_RATIO = 1 - ADMIN_VAULT_RATIO - FEFER_VAULT_RATIO - PUMPER_VAULT_RATIO; // 80%

const SWAP_FEES = "Swap Fees";
const SWAP_FEES_TO_ADMIN_VAULT = "Swap Fees To Admin Vault";
const SWAP_FEES_TO_FEFER_VAULT = "Swap Fees To Fefer Vault";
const SWAP_FEES_TO_PUMPER_VAULT = "Swap Fees To Pumper Vault";
const SWAP_FEES_TO_CREATORS_AND_STAKERS = "Swap Fees To Creators And Token Stakers";

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

  // Lock-launchpad and V4 launches register the shared Uniswap V4 PoolManager
  // as their "pool" -- those aren't V3 pools and are skipped here.
  const candidatePools = [...new Set(registeredLogs.map((log: any) => (log.pool as string).toLowerCase()))];
  const [token0s, token1s] = await Promise.all([
    options.api.multiCall({ abi: "address:token0", calls: candidatePools, permitFailure: true }),
    options.api.multiCall({ abi: "address:token1", calls: candidatePools, permitFailure: true }),
  ]);
  const pools: string[] = [];
  const quotes: string[] = [];
  const quoteIsToken0: boolean[] = [];
  candidatePools.forEach((pool, i) => {
    const token0 = token0s[i]?.toLowerCase();
    const token1 = token1s[i]?.toLowerCase();
    if (!token0 || !token1) return;
    const isToken0 = QUOTE_ASSETS.has(token0);
    if (!isToken0 && !QUOTE_ASSETS.has(token1)) return;
    pools.push(pool);
    quotes.push(isToken0 ? token0 : token1);
    quoteIsToken0.push(isToken0);
  });
  if (!pools.length) {
    return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: 0, dailyProtocolRevenue: 0 };
  }

  const allLogs = await getLogs({ targets: pools, eventAbi: V3_SWAP_EVENT, flatten: false });
  allLogs.forEach((logs: any[], i: number) => {
    if (!logs?.length) return;
    const quote = quotes[i];
    logs.forEach((log: any) => {
      const quoteAmount = BigInt(quoteIsToken0[i] ? log.amount0 : log.amount1);
      const feeAmount = Number(quoteAmount < 0n ? -quoteAmount : quoteAmount) * FEE_FRACTION;
      dailyFees.add(quote, feeAmount, SWAP_FEES);
      dailyRevenue.add(quote, feeAmount * ADMIN_VAULT_RATIO, SWAP_FEES_TO_ADMIN_VAULT);
      dailyRevenue.add(quote, feeAmount * FEFER_VAULT_RATIO, SWAP_FEES_TO_FEFER_VAULT);
      dailyRevenue.add(quote, feeAmount * PUMPER_VAULT_RATIO, SWAP_FEES_TO_PUMPER_VAULT);
      dailySupplySideRevenue.add(quote, feeAmount * SUPPLY_SIDE_RATIO, SWAP_FEES_TO_CREATORS_AND_STAKERS);
      dailyProtocolRevenue.add(quote, feeAmount * ADMIN_VAULT_RATIO, SWAP_FEES_TO_ADMIN_VAULT);
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
    Revenue: "The protocol-side cut taken on each fee harvest: 10% to adminVault, 5% to feferVault, and 5% to pumperVault, per PumperLaunchpad.sol's fixed constants.",
    ProtocolRevenue: "The 10% of swap fees paid to adminVault, the protocol treasury.",
    SupplySideRevenue: "The remaining 80% of swap fees, split between each launched token's stakers/holders and its creator in a ratio the creator sets per token (holderShareBps) -- not further broken out here since it varies per token.",
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: "1% swap fees paid by traders on Uniswap V3 pools for tokens launched through Pumper Launchpad.",
    },
    Revenue: {
      [SWAP_FEES_TO_ADMIN_VAULT]: "10% of swap fees sent to adminVault on each collectLpFees harvest.",
      [SWAP_FEES_TO_FEFER_VAULT]: "5% of swap fees sent to feferVault on each collectLpFees harvest.",
      [SWAP_FEES_TO_PUMPER_VAULT]: "5% of swap fees sent to pumperVault on each collectLpFees harvest.",
    },
    ProtocolRevenue: {
      [SWAP_FEES_TO_ADMIN_VAULT]: "10% of swap fees sent to adminVault, the protocol treasury.",
    },
    SupplySideRevenue: {
      [SWAP_FEES_TO_CREATORS_AND_STAKERS]: "80% of swap fees split between each launched token's stakers/holders and its creator, using the creator-set holderShareBps ratio.",
    },
  },
  pullHourly: true,
  doublecounted: true, // stableswap
};

export default adapter;
