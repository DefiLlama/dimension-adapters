import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-base-stats/0.0.2/gn",
  [CHAIN.MODE]:
    "https://api.goldsky.com/api/public/project_cm2x72f7p4cnq01x5fuy95ihm/subgraphs/bmx-mode-stats/0.0.1/gn",
};

const historicalDataDerivatives = gql`
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
  (chain: string): Fetch =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const dailyData: IGraphResponse = await request(endpoints[chain], historicalDataDerivatives, {
      id: String(dayTimestamp) + ":daily",
      period: "daily",
    });
    const tradingStats: IGraphResponseOI = await request(
      endpoints[chain],
      historicalOI,
      {
        id: String(dayTimestamp) + ":daily",
        period: "daily",
      }
    );
    const openInterestAtEnd =
      Number(tradingStats.tradingStats[0]?.longOpenInterest || 0) +
      Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
    const longOpenInterestAtEnd = Number(
      tradingStats.tradingStats[0]?.longOpenInterest || 0
    );
    const shortOpenInterestAtEnd = Number(
      tradingStats.tradingStats[0]?.shortOpenInterest || 0
    );

    return {
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
                  String(Number(sum) + Number(element))
                )
              ) *
                10 ** -30
            )
          : 0,
    };
  };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BASE]: 1694304000,
  [CHAIN.MODE]: 1720627435,
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: getFetch(chain),
        start: startTimestamps[chain],
      },
    };
  }, {}),
};

export default adapter;
