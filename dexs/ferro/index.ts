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

/* ON chain
import { CHAIN } from "../helpers/chains";
import { getSaddleExports } from "../helpers/saddle";

export default getSaddleExports({
  [CHAIN.CRONOS]: { pools: ['0xe8d13664a42B338F009812Fa5A75199A865dA5cD', '0xa34C0fE36541fB085677c36B4ff0CCF5fa2B32d6', '0x1578C5CF4f8f6064deb167d1eeAD15dF43185afa', '0x5FA9412C2563c0B13CD9F96F0bd1A971F8eBdF96']}
})
 */