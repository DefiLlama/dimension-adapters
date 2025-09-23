import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.FANTOM]:
    sdk.graph.modifyEndpoint('EH6ZfhnYQd7Kv1SdnUAp96vMUWKCTfPrctwududH5cmG'),
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
        if (dayTimestamp > 1708473600) return {};
        const dailyData: IGraphResponse = await request(endpoints[chain], query, {
          id: String(dayTimestamp) + ":daily",
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
  [CHAIN.FANTOM]: 1677883020,
};

const adapter: BreakdownAdapter = {
  deadFrom: "2024-02-21",
  breakdown: {
    swap: {
      [CHAIN.FANTOM]: {
        fetch: getFetch(historicalDataSwap)(CHAIN.FANTOM),
        start: startTimestamps[CHAIN.FANTOM],
      },
    },
    derivatives: {
      [CHAIN.FANTOM]: {
        fetch: getFetch(historicalDataDerivatives)(CHAIN.FANTOM),
        start: startTimestamps[CHAIN.FANTOM],
      },
    },
  },
};

export default adapter;
