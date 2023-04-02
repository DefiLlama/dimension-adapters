import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";

const endpoints = {
  [CHAIN.ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/tskweres/vela-exchange-v2",
};

const methodology = {
  Volume: "Total trading volume",
};

const graphQuery = gql`
  query {
    globalInfos(where: { id: "all" }) {
      volume
    }
  }
`;

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const graphRes = await request(graphUrls[chain], graphQuery);
      const totalVolume = parseInt(graphRes.globalInfos[0].volume) / 1e30;

      return {
        timestamp,
        tradeVolume: totalVolume.toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: graphs(endpoints)(CHAIN.ARBITRUM),
      start: async () => 1675288800,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
