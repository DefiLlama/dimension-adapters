
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import * as sdk from "@defillama/sdk";

const abis = {
  "getPaymentsByDate": "function getPaymentsByDate(string date) view returns ((uint8 currency, string txHash, uint256 amount, uint256 usdAmount, uint256 timestamp)[])",
}


const fetch = async (_:any, _1:any, { createBalances, chain, preFetchedResults, }: FetchOptions) => {
  const exporerStr = chainExplorerMapping[chain]

  const dailyFees = createBalances()

  preFetchedResults.forEach((payment: any) => {
    if (payment.txHash.includes(exporerStr)) dailyFees.addUSDValue(payment.usdAmount/1e18)
  })

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailySupplySideRevenue: 0,
    dailyProtocolRevenue: dailyFees,
    dailyHoldersRevenue: 0,
  }
};

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {

  const arbApi = new sdk.ChainApi({ chain: CHAIN.ARBITRUM,}); // we dont care about block info as we can query by date
  return arbApi.call({  abi: abis.getPaymentsByDate , target: '0xc02add3d60af95bd7652d68c7d510f0d52f994ef', params: options.dateString })
};


const chainExplorerMapping: any = {
  [CHAIN.ARBITRUM]: 'arbiscan',
  [CHAIN.BSC]: 'bscscan',
  [CHAIN.BASE]: 'basescan',
  [CHAIN.POLYGON]: 'polygonscan',
  [CHAIN.OFF_CHAIN]: 'copperx',
}

export default {
  fetch,
  start: '2025-07-11',
  chains: Object.keys(chainExplorerMapping),
  prefetch,
  methodology: {
    Fees: "Payment made by the users",
    Revenue: "All fees are protocol revenue",
  },
}