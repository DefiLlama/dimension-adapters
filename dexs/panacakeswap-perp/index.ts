import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getBlock } from "../../helpers/getBlock";
import * as sdk from "@defillama/sdk";
import { queryDune } from "../../helpers/dune";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type TID = {
  [key: string | Chain]: string;
}
type TBrokerID = {
  [s: string | Chain]: number[];
}
const brokerID: TBrokerID = {
  [CHAIN.BSC]: [2],
  [CHAIN.ARBITRUM]: [1,2]
}
const contract_address: TID = {
  [CHAIN.BSC]: '2826941',
  [CHAIN.ARBITRUM]: '2982352'
}
interface ILog {
  data: string;
  transactionHash: string;
  topics: string[];
}
const topic_0_open = '0xa858fcdefab65cbd1997932d8ac8aa1a9a8c46c90b20947575525d9a2a437f8c'

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
      // const query: IData[] = require(`./${chain}.json`);
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
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: async () => 1692662400,
    },
  },
};

export default adapter;
