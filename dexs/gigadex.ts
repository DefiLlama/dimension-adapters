import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../helpers/uniswap";

// GIGA DEX — PancakeSwap-style AMM fork on Robinhood Chain.
// It runs two independent pool systems, each with its own factory:
//   - Classic: v2-style stable (x*y=k stable) + volatile pools
//   - CL:      v3-style concentrated-liquidity pools (per-pool fee tiers)
// Docs: https://docs.gigadex.fi  |  Contracts: https://docs.gigadex.fi/security/contracts
// Website: https://gigadex.fi  |  Twitter: https://x.com/gigadex_fi
const CLASSIC_FACTORY = "0x6Fdf38f92eAd1adFc04B73aaa947ab254f6c0916";
const CL_FACTORY = "0xEce6eCd61177336ea6Fb9b17937AC439D85EE20B";

// Classic pool swap fees: 0.3% on both volatile and stable pools (confirmed by
// the GIGA team). CL pool fees are read per-pool on-chain.
const CLASSIC_VOLATILE_FEE = 0.003; // 0.3%
const CLASSIC_STABLE_FEE = 0.003; // 0.3%

// Fee distribution (confirmed by the GIGA team):
//   - Non-gauged pools: 20% of swap fees to the protocol treasury, 80% to LPs.
//   - Gauged pools: 100% of swap fees to veGIGA stakers, and LPs are instead
//     rewarded with GIGA emissions (incentives, not fees, so excluded here).
// There are currently 0 gauged pools, so every pool follows the 20% treasury /
// 80% LP split. If gauged pools are created, the gauged fees would need to be
// attributed to dailyHoldersRevenue (veGIGA) instead of the treasury.
const REVENUE_RATIO = 0.2; // protocol treasury's share of swap fees
const PROTOCOL_REVENUE_RATIO = 0.2; // same 20% — all revenue is the treasury cut

const START_DATE = "2026-07-20"; // first swaps on Robinhood Chain

const classicFetch = getUniV2LogAdapter({
  factory: CLASSIC_FACTORY,
  fees: CLASSIC_VOLATILE_FEE,
  stableFees: CLASSIC_STABLE_FEE,
  userFeesRatio: 1,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
});

// PancakeSwap-V3 CL fork: Swap event carries extra protocolFeesToken0/1 fields,
// so the default Uniswap-V3 event signature does not match its logs.
const CL_SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)";

const clFetch = getUniV3LogAdapter({
  factory: CL_FACTORY,
  swapEvent: CL_SWAP_EVENT,
  userFeesRatio: 1,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
});

const DIMENSIONS = [
  "dailyVolume",
  "dailyFees",
  "dailyUserFees",
  "dailyRevenue",
  "dailyProtocolRevenue",
  "dailySupplySideRevenue",
] as const;

const fetch = async (options: FetchOptions) => {
  // Run both pool systems and merge their balances into a single result.
  const classic = await classicFetch(options);
  const cl = await clFetch(options);

  const result: Record<string, ReturnType<FetchOptions["createBalances"]>> = {};
  for (const dim of DIMENSIONS) {
    const balances = options.createBalances();
    if (classic[dim]) balances.addBalances(classic[dim]);
    if (cl[dim]) balances.addBalances(cl[dim]);
    result[dim] = balances;
  }
  return result;
};

const methodology = {
  Volume: "Swap volume across GIGA DEX Classic (v2 stable + volatile) and Concentrated Liquidity pools.",
  Fees: "All swap fees paid by traders. Classic pools charge 0.3% (both volatile and stable); CL pool fees are read per-pool on-chain.",
  UserFees: "Traders pay the full swap fee on every trade.",
  Revenue: "20% of swap fees are kept by the GIGA protocol treasury.",
  ProtocolRevenue: "20% of swap fees routed to the protocol treasury.",
  SupplySideRevenue: "80% of swap fees paid to liquidity providers.",
};

// Labels below match those emitted by the uniswap v2/v3 log helpers.
const breakdownMethodology = {
  Fees: { "Token Swap Fees": "All swap fees charged to traders across Classic and CL pools." },
  UserFees: { "Trading fees": "Full swap fee paid by traders on every trade." },
  Revenue: { "Protocol fees": "20% of swap fees kept by the GIGA protocol treasury." },
  ProtocolRevenue: { "Protocol fees": "20% of swap fees kept by the GIGA protocol treasury." },
  SupplySideRevenue: { "LP fees": "80% of swap fees paid to liquidity providers." },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START_DATE,
  methodology,
  breakdownMethodology,
};

export default adapter;
