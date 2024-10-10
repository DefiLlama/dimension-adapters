import { request } from "graphql-request";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const API_URL = 'https://statistic-api.ashperp.trade/graphql';

interface IVolume {
  volume: string;
  timestamp: number;
}

const VolumeQuery = `
query getVolume {
  overview {
    getPrevious24h {
      volume_24h
    }
  }
}
`

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)) + 86400;
  const dailyVolume: number = (await request(API_URL, VolumeQuery)).overview.getPrevious24h.volume_24h;
  return {
    dailyVolume,
    timestamp: dayTimestamp,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ELROND]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: 1707782400
    },
  },
};

export default adapter;
