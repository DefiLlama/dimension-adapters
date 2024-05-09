import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/velaexchange/vela-exchange-official",
  [CHAIN.BASE]:
    "https://api.thegraph.com/subgraphs/name/velaexchange/vela-exchange-official-base"
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const graphQuery = gql`
        query {
          dailyGlobalInfos(where: { timestamp: ${todaysTimestamp} }) {
            tradeVolume
          }
          globalInfos(where: { id: "all" }) {
            volume
          }
        }
      `;

      const graphRes = await request(graphUrls[chain], graphQuery);
      const totalVolume = parseInt(graphRes.globalInfos[0].volume) / 1e30;
      const dailyVolume =
        parseInt(graphRes.dailyGlobalInfos[0].tradeVolume) / 1e30;
      return {
        timestamp,
        totalVolume: totalVolume.toString(),
        dailyVolume: dailyVolume.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: 1687806000,
    },
    [CHAIN.BASE]: {
      fetch: graphs(endpoints)(CHAIN.BASE),
      start: 1693785600
    }
  },
};

export default adapter;
