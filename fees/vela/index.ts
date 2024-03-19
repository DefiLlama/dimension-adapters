import { Adapter } from "../../adapters/types";
import { ARBITRUM, AVAX } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/velaexchange/vela-exchange-official",
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
          dailyGlobalInfos(where: { timestamp: ${todaysTimestamp} }) {
            fees
          }
        }
      `;
      const graphRes = await request(graphUrls[chain], graphQuery);
      const dailyFee = parseInt(graphRes.dailyGlobalInfos[0].fees) / 1e30;
      return {
        timestamp,
        dailyFees: dailyFee.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: 1687806000,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
