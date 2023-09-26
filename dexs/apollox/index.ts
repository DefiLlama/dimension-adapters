import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type TID = {
  [key: string | Chain]: string;
}


const contract_address: TID = {
  [CHAIN.BSC]: '3053785',
}

interface IData {
  dt: string;
  volume: number;
  fees: number;
}

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number) => {
    try {
      const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
      const dateString = new Date(dayTimestamp * 1000).toISOString().split("T")[0];
      const query: IData[] = (await queryDune(contract_address[chain]))

      const dailyVolume = query.find((e: IData) => e.dt.split(' ')[0] === dateString)?.volume;

      return {
        dailyVolume: `${dailyVolume}`,
        timestamp,
      };
    } catch (error) {
      console.error(error);
      throw error;
    }
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: async () => 1682035200,
    },
  },
};

export default adapter;
