import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpointsPerps: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/67101/swapbased-perps-core/version/latest",
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
    }
  }
`;

const historicalOI = gql`
  query get_trade_stats($period: String!, $id: String!) {
    tradingStats(where: { period: $period, id: $id }) {
      id
      longOpenInterest
      shortOpenInterest
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

interface IGraphResponseOI {
  tradingStats: Array<{
    id: string;
    longOpenInterest: string;
    shortOpenInterest: string;
  }>;
}

const getFetch =
  (query: string) =>
  (chain: string): any =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000),
    );
    const dailyData: IGraphResponse = await request(
      endpointsPerps[chain],
      query,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      },
    );

    const tradingStats: IGraphResponseOI = await request(
      endpointsPerps[chain],
      historicalOI,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      },
    );

    const openInterestAtEnd =
      Number(tradingStats.tradingStats[0]?.longOpenInterest || 0) +
      Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
    const longOpenInterestAtEnd = Number(
      tradingStats.tradingStats[0]?.longOpenInterest || 0,
    );
    const shortOpenInterestAtEnd = Number(
      tradingStats.tradingStats[0]?.shortOpenInterest || 0,
    );

    return {
      timestamp: dayTimestamp,
      longOpenInterestAtEnd: longOpenInterestAtEnd
        ? String(longOpenInterestAtEnd * 10 ** -30)
        : undefined,
      shortOpenInterestAtEnd: shortOpenInterestAtEnd
        ? String(shortOpenInterestAtEnd * 10 ** -30)
        : undefined,
      openInterestAtEnd: openInterestAtEnd
        ? String(openInterestAtEnd * 10 ** -30)
        : undefined,
      dailyVolume:
        dailyData.volumeStats.length == 1
          ? String(
              Number(
                Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
                  String(Number(sum) + Number(element)),
                ),
              ) *
                10 ** -30,
            )
          : undefined
    };
  };

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFetch(historicalDataSwap)(CHAIN.BASE),
      start: "2023-07-09",
    },
  },
};

export default adapter;
