import { request } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const API_URL = 'https://api-v2.ashswap.io/graphql';

interface IVolume {
  totalVolumeUSD24h: number;
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
  const results: IVolume = (await request(API_URL, VolumeQuery)).defillama;
  const dailyVolume = results?.totalVolumeUSD24h;
  return {
    dailyVolume: dailyVolume,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-02-17'
    },
  },
};

export default adapter;
