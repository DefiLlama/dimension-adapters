import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


type ChainMap = {
  [chain: string | Chain]: string;
}
const historicalVolumeEndpoints: ChainMap = {
  [CHAIN.BSC]: "https://api.kiloex.io/common/queryTradeSummary",
  [CHAIN.OP_BNB]: "https://opapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.MANTA]: "https://mantaapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.TAIKO]: "https://taikoapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.BSQUARED]: "https://b2api.kiloex.io/common/queryTradeSummary",
  [CHAIN.BASE]: "https://baseapi.kiloex.io/common/queryTradeSummary",
};

interface IVolume {
  time: number;
  dayTradeAmount:string;
  totalTradeAmount:string
}

const fetch = (chainId: string) => {
  return async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const historicalVolume: IVolume[] = (await fetchURL(historicalVolumeEndpoints[chainId]));

    const dailyVolume = historicalVolume
      .find(item => item.time === dayTimestamp)?.dayTradeAmount

    return {
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC), start: '2023-06-12'
    },
    [CHAIN.OP_BNB]: {
      fetch: fetch(CHAIN.OP_BNB), start: '2023-10-07'
    },
    [CHAIN.MANTA]: {
      fetch: fetch(CHAIN.MANTA), start: '2023-11-01'
    },
    [CHAIN.TAIKO]: {
      fetch: fetch(CHAIN.TAIKO), start: '2024-05-30'
    },
    [CHAIN.BSQUARED]: {
      fetch: fetch(CHAIN.BSQUARED), start: '2024-07-30'
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE), start: '2024-10-09'
    },
  },
};

export default adapter;
