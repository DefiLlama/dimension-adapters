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
query GetAllPairStatisticsToday {
  pairs {
    getAllPairStatistics {
      volume
      timestamp
    }
  }
}
`

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)) + 86400;
  const results: IVolume[] = (await request(API_URL, VolumeQuery)).pairs.getAllPairStatistics;
  let dailyVolume = results.filter((volumeInfo)=>{
    return volumeInfo.timestamp === dayTimestamp;
  })
  return {
    dailyVolume: dailyVolume ? `${dailyVolume[0].volume}` : undefined,
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
