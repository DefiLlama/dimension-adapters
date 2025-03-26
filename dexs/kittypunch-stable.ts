import request from "graphql-request";
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const subgraphUrl = "https://api.goldsky.com/api/public/project_cm33d1338c1jc010e715n1z6n/subgraphs/stable-swap-factory-ng-contracts-subgraph-flow-mainnet/2.2.0/gn"

const fetch: any = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const query = `{
    pools {
      id
      name
      dailyVolumes(
        where: {
          timestamp: ${dayTimestamp}
        }
      ) {
        volume
      }
    }
  }`
  const res = await request(subgraphUrl, query);
  const dailyVolume = res.pools.reduce((acc: number, pool: any) => {
    return acc + pool.dailyVolumes.reduce((poolAcc: number, volume: any) => poolAcc + Number(volume.volume), 0);
  }, 0);
  return {
    dailyVolume,
    timestamp: dayTimestamp,
  }
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLOW]: {
      fetch,
    },
  },
};

export default adapter;
