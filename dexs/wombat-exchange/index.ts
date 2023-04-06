import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { Chain } from "@defillama/sdk/build/general";
interface IGraph {
  dailyTradeVolumeUSD: string;
  dayID: string;
}

type TEndpoint = {
  [s: string | Chain]: string;
};

const endpoints: TEndpoint = {
  [CHAIN.BSC]:
    "https://api.thegraph.com/subgraphs/name/wombat-exchange/wombat-exchange",
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/wombat-exchange/wombat-exchange-arbone",
};

const fetchVolume = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultVolume> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const dayID = dayTimestamp / 86400;
    const query = gql`
      {
          protocolDayData(id: "${dayID}") {
              dayID
              dailyTradeVolumeUSD
          }
      }
      `;
    const response: IGraph = (await request(endpoints[chain], query))
      .protocolDayData;
    const dailyVolume = Number(response.dailyTradeVolumeUSD) / 2;

    return {
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: fetchVolume(CHAIN.BSC),
      start: async () => 1650243600,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume(CHAIN.ARBITRUM),
      start: async () => 1679809928,
    },
  },
};

export default adapter;
