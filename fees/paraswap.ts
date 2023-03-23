import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { Chain } from "@defillama/sdk/build/general";
import fetchURL from "../utils/fetchURL";


const feesMMURL = "https://api.paraswap.io/stk/volume-stats/breakdown-by-chain";
type TChainId = {
  [l: string | Chain]: string;
}
const mapChainId: TChainId = {
  [CHAIN.ETHEREUM]: '1',
  [CHAIN.POLYGON]: '137',
  [CHAIN.BSC]: '56',
  [CHAIN.AVAX]: '43114',
  [CHAIN.FANTOM]: '250',
  [CHAIN.ARBITRUM]: '42161',
  [CHAIN.OPTIMISM]: '10',
}

interface IResponse {
  daily: any[];
  allTime: any;
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const timestampToday = getTimestampAtStartOfDayUTC(timestamp)
    const response: IResponse = (await fetchURL(feesMMURL)).data;
    const dailyResultFees: any[] = response.daily;
    const [__,totalPartnerRevenue, totalProtocolRevenue]: number[] = response.allTime[mapChainId[chain]];
    const [_, partnerRevenue, protocolRevenue]: number[] = dailyResultFees.filter(([time]: any) => time === timestampToday)
      .map(([_, data]: any) => data[mapChainId[chain]]).flat()
    const otherFees = partnerRevenue + protocolRevenue;
    const otherProtocolReveune = protocolRevenue;

    const dailyFees = otherFees;
    const dailyRevenue = otherProtocolReveune;
    const totalFees = totalPartnerRevenue + totalProtocolRevenue;
    const totalRevenue = totalProtocolRevenue;
    return {
      dailyFees: dailyFees.toString(),
      dailyRevenue: dailyRevenue.toString(),
      totalRevenue: totalRevenue.toString(),
      totalFees: totalFees.toString(),
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: async ()  => 1647993600,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: async ()  => 1647993600,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: async ()  => 1647993600,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: async ()  => 1647993600,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: async ()  => 1647993600,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: async ()  => 1647993600,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: async ()  => 1647993600,
    }
  }
}

export default adapter;
