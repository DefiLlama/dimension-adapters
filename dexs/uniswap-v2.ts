import * as sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const methodology = {
  Fees: "User pays 0.3% fees on each swap.",
  UserFees: "User pays 0.3% fees on each swap.",
  Revenue: 'Protocol make no revenue.',
  ProtocolRevenue: 'Protocol make no revenue.',
  SupplySideRevenue: 'All fees are distributed to LPs.',
  HoldersRevenue: 'No revenue for UNI holders.',
}

const chainv2mapping: any = {
  [CHAIN.ARBITRUM]: "ARBITRUM",
  [CHAIN.ETHEREUM]: "ETHEREUM",
  [CHAIN.POLYGON]: "POLYGON",
  [CHAIN.BASE]: "BASE",
  // [CHAIN.BSC]: "BNB",
  [CHAIN.OPTIMISM]: "OPTIMISM",
  [CHAIN.UNICHAIN]: "UNI",
}

async function fetchV2Volume(_t:any, _tb: any , options: FetchOptions) {
  const { api } = options
  const endpoint = `https://interface.gateway.uniswap.org/v2/uniswap.explore.v1.ExploreStatsService/ExploreStats?connect=v1&encoding=json&message=%7B%22chainId%22%3A%22${api.chainId}%22%7D`
  const res = await httpGet(endpoint, {
    headers: {
      'accept': '*/*',
      'accept-language': 'th,en-US;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://app.uniswap.org',
      'pragma': 'no-cache',
      'priority': 'u=1, i',
      'referer': 'https://app.uniswap.org/',
      'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    }
  })
  const dataItem = res.stats.historicalProtocolVolume.Month.v2.find((item: any) => item.timestamp === options.startOfDay);
  if (!dataItem) {
    throw Error(`data not found for date ${options.startOfDay} - chain ${options.chain}`);
  }
  
  const dailyVolume = dataItem.value;
  
  return { dailyVolume, dailyFees: Number(dailyVolume) * 0.003, dailyUserFees: Number(dailyVolume) * 0.003, dailySupplySideRevenue: Number(dailyVolume) * 0.003, dailyRevenue: 0, dailyProtocolRevenue: 0, dailyHoldersRevenue: 0 }
}

const getLogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (_t:any, _tb: any , options: FetchOptions) => {
        const fetchFunction = getUniV2LogAdapter({ factory: '0x8909Dc15e40173Ff4699343b6eB8132c65e18eC6', ...getLogAdapterConfig})
        return await fetchFunction(options);
      },
    },
    ...Object.keys(chainv2mapping).reduce((acc: any, chain) => {
      acc[chain] = {
        fetch: fetchV2Volume,
      }
      return acc
    }, {})
  }
}

export default adapter
