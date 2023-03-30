import { Adapter } from "../../adapters/types";
import { ARBITRUM, AVAX } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/velaexchange/vela-exchange",
};

const methodology = {
  Fees: "Fees collected from user trading fees",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const graphQuery = gql`
        {
          dailyGlobalInfos(where: { id: "global-day-${todaysTimestamp}" }) {
            fees
            tradeVolume
            tradeCounts
          }
        }
      `;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee = parseInt(graphRes.dailyGlobalInfos[0].fees) / 1e30;
      const tradeVolume =
        parseInt(graphRes.dailyGlobalInfos[0].tradeVolume) / 1e30;
      const tradeCounts = parseInt(graphRes.dailyGlobalInfos[0].tradeCounts);

      return {
        timestamp,
        dailyFees: dailyFee.toString(),
        tradeVolume: tradeVolume.toString(),
        tradeCounts: tradeCounts.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: async () => 1630468800,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
