import { Chain } from "../../adapters/types";
import { chains, endpoints } from "../../dexs/integral";
import { request, gql } from "graphql-request";
import { BaseAdapter, ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getUniswapDateId } from "../../helpers/getUniSubgraph/utils";
import { 
  DEFAULT_DAILY_FEES_FIELD, 
  DEFAULT_TOTAL_FEES_FACTORY, 
  DEFAULT_TOTAL_FEES_FIELD 
} from "../../helpers/getUniSubgraphVolume";

const DEFAULT_DAILY_FEES_FACTORY = "dayData";

const graphs = (graphUrls: ChainEndpoints) => {
  const graphQuery = gql`query fees($dateId: Int!) {
    ${DEFAULT_DAILY_FEES_FACTORY}(id: $dateId) {
      ${DEFAULT_DAILY_FEES_FIELD}
    },
    ${DEFAULT_TOTAL_FEES_FACTORY} {
      ${DEFAULT_TOTAL_FEES_FIELD}
    }
  }`;

  return (chain: Chain) => {
    return async (timestamp: number) => {
      const dateId = getUniswapDateId(new Date(timestamp * 1000));

      const graphRes = await request(graphUrls[chain], graphQuery, {
        dateId,
      });

      return {
        timestamp,
        dailyFees: graphRes[DEFAULT_DAILY_FEES_FACTORY][DEFAULT_DAILY_FEES_FIELD],
        dailyRevenue: "0",
      };
    };
  };
};

const adapters: SimpleAdapter = {
  version: 1,
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(endpoints)(chain),
      },
    };
  }, {} as BaseAdapter),
};

export default adapters;