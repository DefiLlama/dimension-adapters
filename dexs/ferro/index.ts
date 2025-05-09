import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import request, { gql } from "graphql-request";

const endpoints = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/ferro/swap",
};

interface IVolume {
  volume: string;
}

const fetchVolume = async (options: FetchOptions) => {
  const query = gql`
    {
      dailyVolumes(where:{timestamp: "${options.startOfDay}"}){
        timestamp
        volume
      }
    }
  `
  const res:IVolume[] = (await request(endpoints[options.chain], query)).dailyVolumes as IVolume[];
  const dailyVolume = res.reduce((acc, item) => acc + Number(item.volume), 0);
  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: fetchVolume,
      start: '2022-08-29',
    },
  },
};

export default adapter;
