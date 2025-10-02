import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getRevenueRatioShares, LLAMA_HL_INDEXER_FROM_TIME, queryHyperliquidIndexer, queryHypurrscanApi } from "../helpers/hyperliquid";

async function fetch(_1: number, _: any,  options: FetchOptions) {
  const dailyFees = options.createBalances()
  const { hlpShare } = getRevenueRatioShares(options.startOfDay)

  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    // get fees from hypurrscan, no volume
    const result = await queryHypurrscanApi(options);
    dailyFees.add(result.dailyPerpFees.clone(hlpShare), 'Perp Fees')
    dailyFees.add(result.dailySpotFees.clone(hlpShare), 'Spot Fees')
  } else {
    const result = await queryHyperliquidIndexer(options);
    dailyFees.add(result.dailyPerpRevenue.clone(hlpShare), 'Perp Fees')
    dailyFees.add(result.dailyPerpRevenue.clone(hlpShare), 'Spot Fees')
  }

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "1% of perp and spot trading revenue (excluding builders and unit revenue) share for HLP.",
  SupplySideRevenue: 'All fees share of HLP are distributed to vaults suppliers.',
  Revenue: "No revenue.",
}

const breakdownMethodology = {
  Fees: {
    'Perp Fees': 'Share of 1% perp trading revenue.',
    'Spot Fees': 'Share of 1% spot trading revenue',
  },
  SupplySideRevenue: {
    'Perp Fees': 'Share of 1% perp trading revenue.',
    'Spot Fees': 'Share of 1% spot trading revenue',
  },
}

const adapter: SimpleAdapter = {
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2024-12-23',
    },
  },
  doublecounted: true, // we have already counted to supplySideRevenue on perps and spot
};

export default adapter;
