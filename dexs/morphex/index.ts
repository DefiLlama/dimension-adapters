import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]:
    "https://api.thegraph.com/subgraphs/name/morphex-labs/morphex-fantom-stats-new",
  [CHAIN.BSC]:
    "https://api.thegraph.com/subgraphs/name/morphex-labs/morphex-bsc-stats",
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
          id: String(dayTimestamp) + ":daily",
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
  [CHAIN.FANTOM]: 1690020000,
  [CHAIN.BSC]: 1686783600,
};

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: {
      [CHAIN.FANTOM]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.FANTOM),
        start: startTimestamps[CHAIN.FANTOM],
      },
      [CHAIN.BSC]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.BSC),
        start: startTimestamps[CHAIN.BSC],
      },
    },
    derivatives: {
      [CHAIN.FANTOM]: {
        fetch: getFetch(historicalDataDerivatives)(CHAIN.FANTOM),
        start: startTimestamps[CHAIN.FANTOM],
      },
      [CHAIN.BSC]: {
        fetch: getFetch(historicalDataDerivatives)(CHAIN.BSC),
        start: startTimestamps[CHAIN.BSC],
      },
    },
  },
};

export default adapter;
