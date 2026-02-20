import * as sdk from "@defillama/sdk";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.ARBITRUM]:
    sdk.graph.modifyEndpoint('https://api.goldsky.com/api/public/project_clu01p4nr68r301pze2tj4sh7/subgraphs/vela-arbitrum/mainnet/gn'),
  [CHAIN.BASE]:
    sdk.graph.modifyEndpoint('https://api.goldsky.com/api/public/project_clu01p4nr68r301pze2tj4sh7/subgraphs/vela-base/mainnet/gn')
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
  deadFrom: '2024-10-24', // https://x.com/vela_exchange/status/1849512562552971665
  version: 1,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: '2023-06-26',
    },
    [CHAIN.BASE]: {
      fetch: graphs(endpoints)(CHAIN.BASE),
      start: '2023-09-04',
    }
  },
};

export default adapter;
