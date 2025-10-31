import fetchURL from "../../utils/fetchURL"
import { Chain } from "../../adapters/types";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
  [s: string]: string;
}

const url: IUrl = {
  [CHAIN.SUI]: "https://api.sudofinance.xyz/volume"
}

interface IVolume {
  totalVolume: number,
  dailyVolume: number,
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const volume: IVolume = (await fetchURL(`${url[chain]}?timestamp=${timestamp}`));
    return {
      dailyVolume: `${volume?.dailyVolume}`,
      timestamp: dayTimestamp,
    };
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      start: '2024-01-05',
    }
  },
};

export default adapter;
