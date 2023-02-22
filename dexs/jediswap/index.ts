import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IGraph {
  dayId: number;
  date: string;
  totalVolumeUSD: string;
  dailyVolumeUSD: string;
}
const URL = 'https://api.jediswap.xyz/graphql';

const fetch = async (timestamp: number): Promise<FetchResult> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dayID = (dayTimestamp / 86400);
    const query = gql`
    {
      exchangeDayDatas(first: 1000, skip: 0, where: { dateGt: 1669593600 }, orderBy: "date", orderByDirection: "asc") {
        date
        dayId
        totalVolumeUSD
        dailyVolumeUSD
      }
    }
    `
    const response: IGraph[] = (await request(URL, query)).exchangeDayDatas;
    const volume = response.find((e: IGraph) => e.dayId === dayID);

    return {
        dailyVolume: volume?.dailyVolumeUSD ? `${volume.dailyVolumeUSD}` : undefined,
        totalVolume: volume?.totalVolumeUSD ? `${volume.totalVolumeUSD}` : undefined,
        timestamp: dayTimestamp,
    };
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.STARKNET]: {
          fetch: fetch,
          start: async () => 1669593600,
        },
    },
};

export default adapter;
