import { CHAIN } from "../helpers/chains"
import { Adapter, FetchOptions, } from '../adapters/types';
import { findClosest } from "../helpers/utils/findClosest";
import { httpGet } from "../utils/fetchURL";
import { METRIC } from "../helpers/metrics";

let data: any
async function getAllData() {
  return (await httpGet(`https://api.hypurrscan.io/fees`)).map((t: any) => ({ ...t, time: t.time * 1e3 }))
}

// fees source: https://hyperdash.info/statistics
const fetch = async (options: FetchOptions) => {
  if (!data) data = getAllData()
  data = await data

  const dailyFees = options.createBalances()
  const startCumFees: any = findClosest(options.startTimestamp, data, 3600)
  const endCumFees: any = findClosest(options.endTimestamp, data, 3600)
  dailyFees.addUSDValue((endCumFees.total_fees - startCumFees.total_fees) / 1e6, 'Trade fees')


  // confirm from hyperliquid team
  // before 30 Aug, 97% of fees go to Assistance Fund for burning tokens, remaining 3% go to HLP Vault
  // after 30 Aug, 99% of fees go to Assistance Fund for burning tokens, remaining 1% go to HLP Vault
  const dailyRevenue = dailyFees.clone(options.startTimestamp >= 1756512000 ? 0.99 : 0.97);
  const dailySupplySideRevenue = dailyFees.clone(options.startTimestamp >= 1756512000 ? 0.01 : 0.03, 'HLP');

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(1, METRIC.TOKEN_BUY_BACK),
    dailyProtocolRevenue: 0,
  }
}


const breakdownMethodology = {
  Fees: {
    'Trade Fees': 'Perp trade fees and Ticker auction proceeds',
  },
  SupplySideRevenue: {
    'HLP': '1% of the fees go to HLP vault (used to be 3%)',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: "All the revenue is used for buying back HYPE tokens"
  },
}

const methodology = {
  Fees: "Trade fees and Ticker auction proceeds. Note this excludes the HLP vault and HyperEVM fees.",
  Revenue: "99% of fees go to Assistance Fund for buying HYPE tokens, before 30 Aug 2025 it was 97% of fees",
  ProtocolRevenue: "Protocol doesn't keep any fees.",
  HoldersRevenue: "99% of fees go to Assistance Fund for bbuying HYPE tokens, before 30 Aug 2025 it was 97% of fees",
  SupplySideRevenue: "1% of fees go to HLP Vault suppliers, before 30 Aug 2025 it was 3%",
}

const adapter: Adapter = {
  version: 2,
  fetch,
  breakdownMethodology,
  chains: [CHAIN.HYPERLIQUID],
  methodology,
}

export default adapter
