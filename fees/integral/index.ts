import { Chain } from "@defillama/sdk/build/types";
import { chains, endpoints } from "../../dexs/integral";
import { request, gql } from "graphql-request";
import { BaseAdapter, ChainEndpoints, SimpleAdapter } from "../../adapters/types";
import { getUniswapDateId } from "../../helpers/getUniSubgraph/utils";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";
import { 
  DEFAULT_DAILY_FEES_FIELD, 
  DEFAULT_DAILY_VOLUME_FIELD, 
  DEFAULT_TOTAL_FEES_FACTORY, 
  DEFAULT_TOTAL_FEES_FIELD 
} from "../../helpers/getUniSubgraphFees";

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
        totalFees: graphRes[DEFAULT_TOTAL_FEES_FACTORY][0][DEFAULT_TOTAL_FEES_FIELD],
        dailyFees: graphRes[DEFAULT_DAILY_FEES_FACTORY][DEFAULT_DAILY_FEES_FIELD],
        totalRevenue: "0",
        dailyRevenue: "0",
      };
    };
  };
};

const adapters: SimpleAdapter = {
  adapter: chains.reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(endpoints)(chain),
        start: getStartTimestamp({
          endpoints: endpoints,
          chain,
          volumeField: DEFAULT_DAILY_VOLUME_FIELD,
          dailyDataField: "dayDatas",
        }),
      },
    };
  }, {} as BaseAdapter),
};

export default adapters;