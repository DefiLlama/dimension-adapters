import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.CRONOS]: "https://graph.cronoslabs.com/subgraphs/name/fulcrom/stats-prod",
  // [CHAIN.ERA]: "https://api.studio.thegraph.com/query/52869/stats-prod/version/latest",
  [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/fulcrom-stats-mainnet/prod/gn"
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
          id: "daily:" + String(dayTimestamp),
          period: "daily",
        });
        const totalData: IGraphResponse = await request(endpoints[chain], query, {
          id: "total",
          period: "total",
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
          totalVolume:
            totalData.volumeStats.length == 1
              ? String(
                Number(
                  Object.values(totalData.volumeStats[0]).reduce((sum, element) =>
                    String(Number(sum) + Number(element))
                  )
                ) *
                10 ** -30
              )
              : undefined,
        };
      };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.CRONOS]: 1677470400,
  [CHAIN.ERA]: 1696496400,   
  [CHAIN.CRONOS_ZKEVM]: 1723698700, 
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
