import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface DayData {
  id: string;
  date: number;
  totalVolumeUSD: string;
  dailyVolumeUSD: string;
}
const URL = 'https://api.sithswap.info/';

const fetch = async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dayID = (dayTimestamp / 86400);
    const query = gql`
    {
      daydatas( orderBy: date, orderDirection: desc) {
        id
        date
        dailyVolumeUSD
        totalVolumeUSD
      }
    }
    `
    const response: DayData[] = (await request(URL, query)).daydatas;
    const volume = response.find((data: DayData) => data.id === dayID.toString());
    return {
        dailyVolume: volume?.dailyVolumeUSD ? `${volume.dailyVolumeUSD}` : undefined,
        timestamp: dayTimestamp,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.STARKNET]: {
          fetch: fetch,
          start: '2023-01-10',
        },
    },
};

export default adapter;
