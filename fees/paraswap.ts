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
    const response: IResponse = (await fetchURL(feesMMURL));
    const dailyResultFees: any[] = response.daily;
    const [__,totalPartnerRevenue, totalProtocolRevenue]: number[] = response.allTime[mapChainId[chain]];
    const [_, partnerRevenue, protocolRevenue]: number[] = dailyResultFees.filter(([time]: any) => time === timestampToday)
      .map(([_, data]: any) => data[mapChainId[chain]]).flat()
    const otherFees = partnerRevenue + protocolRevenue;
    const otherProtocolReveune = protocolRevenue;

    const dailyFees = otherFees;
    if (dailyFees > 1_000_000) {
      return {} as FetchResultFees;
    }
    const dailyRevenue = otherProtocolReveune;
    const totalFees = totalPartnerRevenue + totalProtocolRevenue;
    const totalRevenue = totalProtocolRevenue;
    return {
      dailyFees: dailyFees ? dailyFees.toString() : undefined,
      dailyRevenue: dailyRevenue ? dailyRevenue.toString() : undefined,
      totalRevenue: totalRevenue ? totalRevenue.toString() : undefined,
      totalFees: totalFees ? totalFees.toString(): undefined,
      timestamp
    }
  }
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
        fetch: fetch(CHAIN.ETHEREUM),
        start: 1647907200,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: 1647907200,
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: 1647907200,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1647907200,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(CHAIN.FANTOM),
      start: 1647907200,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1647907200,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: 1647907200,
    }
  }
}

export default adapter;
