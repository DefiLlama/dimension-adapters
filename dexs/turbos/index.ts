import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
  [s: string]: string;
}

const url: IUrl = {
  [CHAIN.SUI]: "https://api.turbos.finance/dex/volume"
}

interface IVolume {
  totalVolume: number,
  dailyVolume: number,
  weekVolume: number,
  monthVolume: number,
}

const fetch = (chain: Chain) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    const volume: IVolume = (await fetchURL(url[chain]));
    return {
      totalVolume: `${volume?.totalVolume || undefined}`,
      dailyVolume: `${volume?.dailyVolume || undefined}`,
      weekVolume: `${volume?.weekVolume || undefined}`,
      monthVolume: `${volume?.monthVolume || undefined}`,
      timestamp: dayTimestamp,
    };
  };
}



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      runAtCurrTime: true,
      start: 1697241600,
    }
  },
};

export default adapter;
