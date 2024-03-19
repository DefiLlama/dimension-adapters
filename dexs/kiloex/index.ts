import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";


type ChainMap = {
  [chain: string | Chain]: string;
}
const historicalVolumeEndpoints: ChainMap = {
  [CHAIN.BSC]: "https://api.kiloex.io/common/queryTradeSummary",
  [CHAIN.OP_BNB]: "https://opapi.kiloex.io/common/queryTradeSummary",
  [CHAIN.MANTA]: "https://mantaapi.kiloex.io/common/queryTradeSummary"
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

    const totalVolume = historicalVolume
      .find(item => item.time === dayTimestamp)?.totalTradeAmount

    const dailyVolume = historicalVolume
      .find(item => item.time === dayTimestamp)?.dayTradeAmount

    return {
      totalVolume: totalVolume,
      dailyVolume: dailyVolume,
      timestamp: dayTimestamp,
    };
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC), start: 1686528000
    },
    [CHAIN.OP_BNB]: {
      fetch: fetch(CHAIN.OP_BNB), start: 1696636800
    },
    [CHAIN.MANTA]: {
      fetch: fetch(CHAIN.MANTA), start: 1698796800
    },
  },
};

export default adapter;
