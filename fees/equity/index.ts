import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { FANTOM } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [FANTOM]: "https://api.thegraph.com/subgraphs/name/chimpydev/equity-core2",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const searchTimestamp = todaysTimestamp + ":daily";

      const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee =
        parseInt(graphRes.feeStat?.mint || 0) +
        parseInt(graphRes.feeStat?.burn || 0) +
        parseInt(graphRes.feeStat?.marginAndLiquidation || 0) +
        parseInt(graphRes.feeStat?.swap || 0);
      const finalDailyFee = dailyFee / 1e30;

      return {  // 100.00% of All & Any Fees generated goes to veEQUAL voters
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyRevenue: finalDailyFee.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [FANTOM]: {
      fetch: graphs(endpoints)(FANTOM),
      start: 1689767230,
      meta: {
        methodology: '100.00% of All & Any Fees generated from All activity on Any Equity Platform Product goes solely to veEQUAL voters.'
      }
    },
  },
};

export default adapter;
