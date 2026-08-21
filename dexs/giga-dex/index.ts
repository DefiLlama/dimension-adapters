import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getUniV2LogAdapter, getUniV3LogAdapter } from "../../helpers/uniswap";
import { getBrownFiV3Fetch } from "../brownfi-v3";

const CLASSIC_FACTORY = "0x6Fdf38f92eAd1adFc04B73aaa947ab254f6c0916";
const CL_FACTORY = "0xEce6eCd61177336ea6Fb9b17937AC439D85EE20B";
const BROWNFI_FACTORY = "0x831880Bd3b331249DF63bacC6e21495e5e8f1eAA";
const BROWNFI_PAIR_CONFIG = "0xD3F729D909a7E84669A35c3F25b37b4AC3487784";

const REVENUE_RATIO = 0.2; // protocol treasury's share of swap fees

// GIGA DEX Classic (uniswap-v2 style) pools
const classicFetch = getUniV2LogAdapter({
  factory: CLASSIC_FACTORY,
  fees: 0.003,
  stableFees: 0.003,
  userFeesRatio: 1,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: REVENUE_RATIO,
});

// PancakeSwap-V3 CL fork: Swap event carries extra protocolFeesToken0/1 fields,
// so the default Uniswap-V3 event signature does not match its logs.
const CL_SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)";

// GIGA DEX Concentrated Liquidity pools
const clFetch = getUniV3LogAdapter({
  factory: CL_FACTORY,
  swapEvent: CL_SWAP_EVENT,
  userFeesRatio: 1,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: REVENUE_RATIO,
});

// BrownFi oracle-based AMM pools deployed for GIGA DEX,
// fee and protocol share (feeSplit) are read on-chain per pair
const brownfiFetch = getBrownFiV3Fetch({
  [CHAIN.ROBINHOOD]: {
    factory: BROWNFI_FACTORY,
    pairConfig: BROWNFI_PAIR_CONFIG,
    start: '2026-07-29',
  },
});

// classic and CL fetches already emit these labels, BrownFi balances are
// merged under them too so the breakdown stays unified
const dimensionLabels: Record<string, string | undefined> = {
  dailyVolume: undefined,
  dailyFees: METRIC.SWAP_FEES,
  dailyUserFees: 'Trading fees',
  dailyRevenue: 'Protocol fees',
  dailyProtocolRevenue: 'Protocol fees',
  dailySupplySideRevenue: 'LP fees',
};

const fetch = async (options: FetchOptions) => {
  // Run all three pool systems and merge their balances into a single result.
  const classic = await classicFetch(options);
  const cl = await clFetch(options);
  const brownfi = await brownfiFetch(options);

  const result: Record<string, Balances> = {};
  for (const [dimension, label] of Object.entries(dimensionLabels)) {
    const balances = options.createBalances();
    if (classic[dimension] && typeof classic[dimension] !== 'number') balances.addBalances(classic[dimension]);
    if (cl[dimension] && typeof cl[dimension] !== 'number') balances.addBalances(cl[dimension]);
    if (brownfi[dimension] && typeof brownfi[dimension] !== 'number') balances.addBalances(brownfi[dimension], label);
    result[dimension] = balances;
  }
  return result;
};

const methodology = {
  Fees: "Swap fees paid by traders across GIGA DEX Classic (v2 stable + volatile), Concentrated Liquidity and BrownFi oracle-based pools.",
  UserFees: "Traders pay the full swap fee on every trade.",
  Revenue: "Share of swap fees kept by the GIGA protocol treasury (20% on Classic and CL pools, per-pair feeSplit read on-chain for BrownFi pools).",
  ProtocolRevenue: "Share of swap fees routed to the GIGA protocol treasury.",
  SupplySideRevenue: "Share of swap fees paid to liquidity providers.",
  HoldersRevenue: "Holders do not earn any revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders across Classic, CL and BrownFi pools.",
  },
  UserFees: {
    'Trading fees': "Full swap fee paid by traders on every trade.",
  },
  Revenue: {
    'Protocol fees': "Share of swap fees kept by the GIGA protocol treasury.",
  },
  ProtocolRevenue: {
    'Protocol fees': "Share of swap fees kept by the GIGA protocol treasury.",
  },
  SupplySideRevenue: {
    'LP fees': "Share of swap fees paid to liquidity providers.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-15',
  methodology,
  breakdownMethodology,
};

export default adapter;
