import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const graphEndpoint = "https://api.studio.thegraph.com/query/51510/nefi-base-mainnet-stats/version/latest";
const startTimestamp = 1693526400;

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
  (query: string): Fetch =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dailyId = `${String(dayTimestamp)}:daily`;
    const dailyData: IGraphResponse = await request(graphEndpoint, query, {
      id: dailyId,
      period: "daily",
    });

    return {
      timestamp: dayTimestamp,
      dailyVolume:
        dailyData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))
              ) *
                10 ** -30
            )
          : undefined,
    };
  };

const adapter: BreakdownAdapter = {
  deadFrom: '2025-01-28',
  breakdown: {
    swap: {
      [CHAIN.BASE]: {
        fetch: getFetch(historicalDataSwap),
        start: startTimestamp,
      },
    },

    derivatives: {
      [CHAIN.BASE]: {
        fetch: getFetch(historicalDataDerivatives),
        start: startTimestamp,
      },
    },
  },
};

export default adapter;
