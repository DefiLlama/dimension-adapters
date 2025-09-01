import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: "https://subgraph.satsuma-prod.com/dff088b6cd75/kesters-team/bsc_stats/api",
  [CHAIN.MANTLE]: "https://subgraph.satsuma-prod.com/dff088b6cd75/kesters-team/mantle_stats/api",
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/dff088b6cd75/kesters-team/ktx_stats/api",
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      swap
    }
  }
`;

const historicalDataDerivatives = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
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

const getFetch =
  (query: string) =>
    (chain: string): Fetch =>
      async (timestamp: number) => {
        const dayTimestamp = getUniqStartOfTodayTimestamp(
          new Date(timestamp * 1000)
        );
        const dailyData: IGraphResponse = await request(endpoints[chain], query, {
          id:
            chain === CHAIN.BSC ||
              chain === CHAIN.MANTLE ||
              chain === CHAIN.ARBITRUM
              ? String(dayTimestamp)
              : String(dayTimestamp) + ":daily",
          period: "daily",
        });

        return {
          timestamp: dayTimestamp,
          dailyVolume:
            dailyData.volumeStats.length == 1
              ? String(
                Number(
                  Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
                    String(Number(sum) + Number(element))
                  )
                ) *
                10 ** -30
              )
              : undefined,
        };
      };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BSC]: 1682870400,
  [CHAIN.MANTLE]: 1693843200,
  [CHAIN.ARBITRUM]: 1705248000,
};

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataSwap)(chain),
          start: startTimestamps[chain],
        },
      };
    }, {}),
    derivatives: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataDerivatives)(chain),
          start: startTimestamps[chain],
        },
      };
    }, {}),
  },
};

export default adapter;
