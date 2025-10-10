import { Adapter, FetchResultFees, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";
import { FetchOptions } from "../../adapters/types";
import { sleep } from "../../utils/utils";

interface IResponse {
  daily: any[];
  allTime: any;
}

const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";

const mapChainId: Record<string, string> = {
  [CHAIN.ETHEREUM]: '1',
  [CHAIN.OPTIMISM]: '10',
  [CHAIN.BSC]: '56',
  [CHAIN.POLYGON]: '137',
  [CHAIN.FANTOM]: '250',
  [CHAIN.POLYGON_ZKEVM]: '1101',
  [CHAIN.BASE]: '8453',
  [CHAIN.ARBITRUM]: '42161',
  [CHAIN.AVAX]: '43114',
}

const prefetch = async (_: any) => {
  const headers: any = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    "cache-control": "max-age=0",
    "priority": "u=0, i",
    "upgrade-insecure-requests": "1",
    "referrerPolicy": "strict-origin-when-cross-origin",
  };

  // sometime paraswap api return unknown 500 error
  // need to retry if it failed
  for (let i = 0; i < 5; i++) {
    try {
      return await httpGet(feesMMURL, { headers });
    } catch(e: any) {
      if (i === 4) {
        throw e;
      }
    }

    await sleep(5000); // sleep 5 secs for next try
  }

}

const fetchFees = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
  const chain = options.chain;
  if (chain == CHAIN.FANTOM && timestamp > 1744416000) return {} as FetchResultFees; // fantom delisted at 2025-04-12
  const timestampToday = getTimestampAtStartOfDayUTC(timestamp)
  const response: IResponse = options.preFetchedResults || [];
  const dailyResultFees: any[] = response.daily;

  const [dailyVolume, partnerRev, protocolRev]: number[] = dailyResultFees.filter(([time]: any) => time === timestampToday)
    .map(([_, data]: any) => data[mapChainId[chain]]).flat()

  const dailyFees = partnerRev || 0 + protocolRev || 0;
  const dailyRevenue = (protocolRev || 0);
  const holdersRevenue = dailyRevenue * 0.8; // 80% staking rewards
  const protocolRevenue = dailyRevenue * 0.2; // 20% protocol revenue

  return {
    dailyFees: dailyFees || 0,
    dailyUserFees: dailyFees || 0,
    dailyRevenue: dailyRevenue || 0,
    dailyProtocolRevenue: protocolRevenue || 0,
    dailyHoldersRevenue: holdersRevenue || 0,
  }
}

const fetchVolume = async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const chain = options.chain;
  if (chain == CHAIN.FANTOM && timestamp > 1744416000) return {} as FetchResultVolume; // fantom delisted at 2025-04-12
  const timestampToday = getTimestampAtStartOfDayUTC(timestamp)
  const response: IResponse = options.preFetchedResults || [];
  const dailyResultFees: any[] = response.daily;

  const [dailyVolume, partnerRev, protocolRev]: number[] = dailyResultFees.filter(([time]: any) => time === timestampToday)
    .map(([_, data]: any) => data[mapChainId[chain]]).flat()

  return {
    dailyVolume: dailyVolume || 0
  }
}

const createAdapter = (fetchFunction: any): Adapter => ({
  version: 1,

  start: '2022-03-22',
  methodology: {
    Fees: "All trading fees paid by users",
    Revenue: "Trading fees collected by Velora protocol",
    ProtocolRevenue: "20% of revenue to Velora protocol",
    HoldersRevenue: "80% of revenue to stakers as part of PSP 2.0 staking rewards",
  },
  chains: Object.keys(mapChainId),
  fetch: fetchFunction, prefetch,
})

export function getParaswapAdapter(type: "fees" | "volume"): Adapter {
  return createAdapter(type === "fees" ? fetchFees : fetchVolume);
}
