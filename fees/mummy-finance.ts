import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import customBackfill from "../helpers/customBackfill";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/mummyfinance/fantom-stats-v2",
  [CHAIN.OPTIMISM]: "https://api.thegraph.com/subgraphs/name/mummyfinance/op-stats",
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      swap
    }
  }
`;

interface IGraphResponse {
  volumeStats: Array<{
    burn: string;
    liquidation: string;
    margin: string;
    mint: string;
    swap: string;
  }>;
}

const graphs = (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const searchTimestamp = todaysTimestamp;

      const graphQuery = gql`{
          feeStat(id: "${searchTimestamp}") {
            mint
            burn
            marginAndLiquidation
            swap
          }
        }`;

      const graphRes = await request(endpoints[chain], graphQuery);

      const dailyFee =
        parseInt(graphRes.feeStat.mint) +
        parseInt(graphRes.feeStat.burn) +
        parseInt(graphRes.feeStat.marginAndLiquidation) +
        parseInt(graphRes.feeStat.swap);
      const finalDailyFee = dailyFee / 1e30;
      const userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap);
      const finalUserFee = userFee / 1e30;

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
				dailyRevenue: (finalDailyFee * 0.4).toString(),
      };
    };
};

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.FANTOM]: 1670198400,
  [CHAIN.OPTIMISM]: 1677603600,
};
const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: graphs(CHAIN.FANTOM),
      start: startTimestamps[CHAIN.FANTOM],
    },
    [CHAIN.OPTIMISM]: {
      fetch: graphs(CHAIN.OPTIMISM),
      start: startTimestamps[CHAIN.OPTIMISM],
    },
  },
};

export default adapter;
