import { request } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const API_URL = 'https://api-v2.ashswap.io/graphql';

const VolumeQuery = `
{
  defillama {
    totalVolumeUSD24h
  }
}
`

const fetch = async (timestamp: number) => {
  const results = await request(API_URL, VolumeQuery);
  return {
    dailyVolume: results.defillama.totalVolumeUSD24h,
    timestamp: getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)),
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      start: async () => 1676678400
    },
  },
};

export default adapter;
