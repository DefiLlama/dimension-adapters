import { Adapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/liondextrade/finance",
};

const methodology = {
  Fees: "Daily fees collected from user trading fees",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

      const graphQuery = gql`
        {
          dailyGlobalInfo(id: "global-fee-${todaysTimestamp}" ) {
            fees
          }
        }
      `;
      const graphRes = await request(graphUrls[chain], graphQuery);

      return {
        timestamp,
        dailyFees: graphRes.dailyGlobalInfo.fees,
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: async () => 1686614400,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
