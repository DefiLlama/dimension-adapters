import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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
    const volume: IVolume = (await fetchURL(url[chain]))?.data;
    return {
      totalVolume: `${volume?.totalVolume || undefined}`,
      dailyVolume: `${volume?.dailyVolume || undefined}`,
      weekVolume: `${volume?.weekVolume || undefined}`,
      monthVolume: `${volume?.monthVolume || undefined}`,
      timestamp: Math.ceil(Date.now() / 1000),
    };
  };
}



const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      start: async () => 1683158400,
    }
  },
};

export default adapter;
