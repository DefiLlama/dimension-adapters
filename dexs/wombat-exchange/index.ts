import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
interface IGraph {
  dailyTradeVolumeUSD: string;
  dayID: string;
}

const URL =
  "https://api.thegraph.com/subgraphs/name/wombat-exchange/wombat-exchange";

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dayID = dayTimestamp / 86400;
  const query = gql`
    {
        protocolDayData(id: "${dayID}") {
            dayID
            dailyTradeVolumeUSD
        }
    }
    `;
  const response: IGraph = (await request(URL, query)).protocolDayData;
  console.log(response);
  const dailyVolume = Number(response.dailyTradeVolumeUSD) / 2;

  return {
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetch,
      start: async () => 1650243600,
    },
  },
};

export default adapter;
