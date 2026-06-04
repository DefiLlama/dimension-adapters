import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getRevenueRatioShares, queryHypurrscanApi } from "../helpers/hyperliquid";

async function fetch(_1: number, _: any,  options: FetchOptions) {
  const dailyFees = options.createBalances()

  const { hlpShare } = getRevenueRatioShares(options.startOfDay)
  const result = await queryHypurrscanApi(options);
  const perpFees = result.dailyPerpFees.clone(hlpShare)
  const spotFees = result.dailySpotFees.clone(hlpShare)

  dailyFees.add(perpFees, 'Perp Fees')
  dailyFees.add(spotFees, 'Spot Fees')

  return {
    dailyFees,
    dailyRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "HLP's share of Hyperliquid perp and spot trading fees, using public cumulative Hypurrscan fee data. HLP received 3% before 30 Aug 2025 and receives 1% after.",
  SupplySideRevenue: 'All fees share of HLP are distributed to vaults suppliers.',
  Revenue: "No revenue.",
}

const breakdownMethodology = {
  Fees: {
    'Perp Fees': 'HLP share of perp trading fees.',
    'Spot Fees': 'HLP share of spot trading fees',
  },
  SupplySideRevenue: {
    'Perp Fees': 'HLP share of perp trading fees.',
    'Spot Fees': 'HLP share of spot trading fees',
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
