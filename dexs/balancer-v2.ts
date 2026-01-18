import { FetchOptions } from '../adapters/types'
import { getFeesExport } from '../helpers/balancer'
import { CHAIN } from '../helpers/chains'

const ESTIMATED_NON_CORE_SHARE = 0.7; 
const ESTIMATED_CORE_SHARE = 0.3; 
const HOLDERS_SHARE_NON_CORE = 0.825; // 82.5% for non-core pools
const HOLDERS_SHARE_CORE = 0.125; // 12.5% for core pools

const weightedHoldersShare = ESTIMATED_NON_CORE_SHARE * HOLDERS_SHARE_NON_CORE + ESTIMATED_CORE_SHARE * HOLDERS_SHARE_CORE;

const revenueRatio = 0.5;
const holderRevenueRatio = revenueRatio * weightedHoldersShare;
const protocolRevenueRatio = revenueRatio - holderRevenueRatio;

async function fetch(options: FetchOptions) {
  // https://x.com/Balancer/status/1988685056982835470
  const WhitehatActivitiesChains: Array<string> = [
    CHAIN.ETHEREUM,
    CHAIN.OPTIMISM,
    CHAIN.ARBITRUM,
  ]
  if ((options.startOfDay === 1762992000 || options.startOfDay === 1762905600) && WhitehatActivitiesChains.includes(options.chain)) {
    return {
      dailyVolume: 0,
      dailyFees: 0,
      dailyRevenue: 0,
      dailyProtocolRevenue: 0,
      dailySupplySideRevenue: 0,
      dailyHoldersRevenue: 0,
    }
  } else {
    const fetchFunction = getFeesExport('0xBA12222222228d8Ba445958a75a0704d566BF2C8', { revenueRatio, protocolRevenueRatio, holderRevenueRatio, });
    return await fetchFunction(options);
  }
}

export default {
  version: 2,
  fetch: fetch,
  methodology: {
    Fees: "All trading fees collected (includes swap and  yield fee)",
    UserFees: "Trading fees paid by users, ranging from 0.0001% to 10%",
    Revenue: "Protocol revenue from all fees collected",
    ProtocolRevenue: "Balancer V2 protocol fees are set to 50%",
    SupplySideRevenue: "A small percentage of the trade paid by traders to pool LPs",
  },
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: '2021-04-23',
    },
    [CHAIN.POLYGON]: {
      start: '2021-06-24',
    },
    [CHAIN.ARBITRUM]: {
      start: '2021-08-31',
    },
    [CHAIN.AVAX]: {
      start: '2023-02-25',
    },
    [CHAIN.XDAI]: {
      start: '2023-01-10',
    },
    [CHAIN.BASE]: {
      start: '2023-07-26',
    },
    [CHAIN.MODE]: {
      start: '2024-05-22',
    },
    [CHAIN.FRAXTAL]: {
      start: '2024-05-20',
    },
    [CHAIN.OPTIMISM]: {
      start: '2022-05-04',
    },
  },
}

