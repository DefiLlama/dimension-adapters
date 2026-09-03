import { Balances } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { getUniV2LogAdapter } from "../../helpers/uniswap";
import { getBrownFiV3Fetch } from "../brownfi-v3";

// GIGA DEX Classic (uniswap-v2 style) factory on Robinhood Chain, first pair created 2026-07-15
// https://robinhoodchain.blockscout.com/address/0x6Fdf38f92eAd1adFc04B73aaa947ab254f6c0916
const CLASSIC_FACTORY = "0x6Fdf38f92eAd1adFc04B73aaa947ab254f6c0916";

// BrownFi oracle-based AMM factory deployed for GIGA DEX, first pair created 2026-07-29
// https://robinhoodchain.blockscout.com/address/0x831880Bd3b331249DF63bacC6e21495e5e8f1eAA
const BROWNFI_FACTORY = "0x831880Bd3b331249DF63bacC6e21495e5e8f1eAA";
// factory.pairConfig(), holds the per-pair fee and feeSplit
// https://robinhoodchain.blockscout.com/address/0xD3F729D909a7E84669A35c3F25b37b4AC3487784
const BROWNFI_PAIR_CONFIG = "0xD3F729D909a7E84669A35c3F25b37b4AC3487784";
const BROWNFI_START = '2026-07-29';
const BROWNFI_START_TIMESTAMP = 1785283200; // 2026-07-29T00:00:00Z

// Classic pairs charge a flat 0.3% swap fee (UniswapV2Pair fork, hardcoded in the pair contract),
// of which the protocol treasury keeps 20% via feeTo, same values the giga-dex factory entry used
const CLASSIC_FEES = 0.003;
const REVENUE_RATIO = 0.2;

// GIGA DEX Classic (uniswap-v2 style) pools
const classicFetch = getUniV2LogAdapter({
  factory: CLASSIC_FACTORY,
  fees: CLASSIC_FEES,
  stableFees: CLASSIC_FEES,
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
    start: BROWNFI_START,
  },
});

// the Classic fetch already emits these labels, BrownFi balances are
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
  // Run both pool systems and merge their balances into a single result.
  const classic = await classicFetch(options);
  // BrownFi pools only exist from BROWNFI_START, skip them on earlier runs
  const brownfi = options.startTimestamp >= BROWNFI_START_TIMESTAMP ? await brownfiFetch(options) : {} as Record<string, any>;

  const result: Record<string, Balances> = {};
  for (const [dimension, label] of Object.entries(dimensionLabels)) {
    const balances = options.createBalances();
    if (classic[dimension] && typeof classic[dimension] !== 'number') balances.addBalances(classic[dimension]);
    if (brownfi[dimension] && typeof brownfi[dimension] !== 'number') balances.addBalances(brownfi[dimension], label);
    result[dimension] = balances;
  }
  return result;
};

const methodology = {
  Fees: "Swap fees paid by traders across GIGA DEX Classic (v2 stable + volatile) and BrownFi oracle-based pools.",
  UserFees: "Traders pay the full swap fee on every trade.",
  Revenue: "Share of swap fees kept by the GIGA protocol treasury (20% on Classic pools, per-pair feeSplit read on-chain for BrownFi pools).",
  ProtocolRevenue: "Share of swap fees routed to the GIGA protocol treasury.",
  SupplySideRevenue: "Share of swap fees paid to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders across Classic and BrownFi pools.",
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
