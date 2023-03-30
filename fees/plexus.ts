import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

type TChainID = {
  [j: string| Chain]: number;
}
const ChainId: TChainID = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.BSC]: 56,
  [CHAIN.POLYGON]: 137,
  [CHAIN.FANTOM]: 250,
};

const fetch = (chainId: number) => {
  return async (timestamp: number) => {
    const dateString = new Date(timestamp * 1000).toISOString().split('T')[0];
    const data = (await fetchURL(`https://api.plexus.app/v1/dashboard/fee?date=${dateString}`)).data.data;
    const dailyFee = data[chainId] || 0;
    return {
      timestamp,
      dailyFee
    }
  }
};
const adapter: SimpleAdapter = {
  adapter: Object.keys(ChainId).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(ChainId[chain]),
        start: async () => 1675209600,
      },
    }
  }, {}),
}

export default adapter
