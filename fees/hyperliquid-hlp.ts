import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getRevenueRatioShares, LLAMA_HL_INDEXER_FROM_TIME, queryHyperliquidIndexer, queryHypurrscanApi } from "../helpers/hyperliquid";

// hl api return data in random days, not every days
// so we will cal avg pnl from lower timestamp to upper timestamp
// for example, hl api return data for 9 Oct, 11 Oct but missing 10 Oct
// so the fees for both 9 Oct and 10 Oct are: (Fees of 11 Oct - Fees of 1 Oct) / 2
// function getAvgPnlForDay({ historyPnls, timestamp }: { historyPnls: {[key: number]: number}, timestamp: number }): number {
//   const ONE_DAY = 24 * 3600

//   const currentTimestamp = Math.floor(new Date().getTime() / 1000)
//   let upperTimestamp = timestamp + ONE_DAY
//   if (upperTimestamp > currentTimestamp) {
//     throw Error(`can not found data for day ${timestamp}`)
//   }

//   let lowerTimestamp = timestamp

//   while(!historyPnls[upperTimestamp]) {
//     upperTimestamp += ONE_DAY;
//   }
//   while(!historyPnls[lowerTimestamp]) {
//     lowerTimestamp -= ONE_DAY;
//   }

//   const days = (upperTimestamp - lowerTimestamp) / ONE_DAY
//   const pnl = historyPnls[upperTimestamp] - historyPnls[lowerTimestamp]

//   return pnl / days
// }

async function fetch(_1: number, _: any,  options: FetchOptions) {
  const dailyFees = options.createBalances()

  // const vaultData = await httpPost('https://api-ui.hyperliquid.xyz/info', {
  //   type: 'vaultDetails',
  //   vaultAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
  // })

  // const historyPnls: {[key: number]: number} = {}
  // for (const chartItem of vaultData.portfolio) {
  //   if (chartItem[0] === 'allTime') {
  //     for (const pnlItem of chartItem[1].pnlHistory) {
  //       const timestamp = getUniqStartOfTodayTimestamp(new Date(pnlItem[0]))
  //       historyPnls[timestamp] = Number(pnlItem[1])
  //     }
  //   }
  // }

  // const dailyPnl = getAvgPnlForDay({ timestamp: options.startOfDay, historyPnls })

  let perpFees = options.createBalances()
  let spotFees = options.createBalances()
  const { hlpShare } = getRevenueRatioShares(options.startOfDay)
  if (options.startOfDay < LLAMA_HL_INDEXER_FROM_TIME) {
    // get fees from hypurrscan, no volume
    const result = await queryHypurrscanApi(options);
    perpFees = result.dailyPerpFees.clone(hlpShare)
    spotFees = result.dailySpotFees.clone(hlpShare)
  } else {
    const result = await queryHyperliquidIndexer(options);
    perpFees = result.dailyPerpRevenue.clone(hlpShare)
    spotFees = result.dailySpotRevenue.clone(hlpShare)
  }

  dailyFees.add(perpFees, 'Perp Fees')
  dailyFees.add(perpFees, 'Spot Fees')
  // dailyFees.addUSDValue(dailyPnl, 'Market Making & Liquidation Fees')

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
    // 'Market Making & Liquidation Fees': 'All market marking and liquidation profits.',
  },
  SupplySideRevenue: {
    'Perp Fees': 'Share of 1% perp trading revenue.',
    'Spot Fees': 'Share of 1% spot trading revenue',
    // 'Market Making & Liquidation Fees': 'All market marking and liquidation profits.',
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
  // allowNegativeValue: true, // HLP vault PnL can be negative
};

export default adapter;
