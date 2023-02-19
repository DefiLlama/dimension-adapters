import { request } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import fetchURL from "../../utils/fetchURL"

const API_URL = 'https://api.ashswap.io/overview/volume';

interface IVolume {
  volume: number;
  time: number;
}

const VolumeQuery = `
{
  defillama {
    totalVolumeUSD24h
  }
}
`

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const results: any[] = (await fetchURL(API_URL)).data;
  const volumes = results.map((e: any) => {
    const [time, volume] = e;
    return {
      volume,
      time
    }
  });
  const dailyVolume = volumes.find((e: IVolume) => e.time === dayTimestamp);
  const totalVolume = volumes
    .filter((e: IVolume) => e.time <= dayTimestamp)
    .reduce((a: number, e: IVolume) => a+e.volume, 0);
  return {
    dailyVolume: dailyVolume ? `${totalVolume}` : undefined,
    totalVolume: totalVolume.toString(),
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      start: async () => 1676592000
    },
  },
};

export default adapter;
