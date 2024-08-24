import request, { gql } from "graphql-request";
import {
  BreakdownAdapter,
  Fetch
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import BigNumber from "bignumber.js";


const startTimestamps: { [chain: string]: number } = {
  [CHAIN.BASE]: 1694304000,
  [CHAIN.MODE]: 1720627435,
};
const endpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/71696/bmx-base-stats/version/latest",
  [CHAIN.MODE]:
    "https://api.studio.thegraph.com/query/42444/bmx-mode-stats/version/latest",
};
const freestyleEndpoints: { [key: string]: string } = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/62454/analytics_base_8_2/version/latest",
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
interface IGraphResponseFreestyle {
  dailyHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: string;
  }>;
  totalHistories: Array<{
    tiemstamp: string;
    platformFee: string;
    accountSource: string;
    tradeVolume: BigNumber;
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
    let dailyOpenInterest = 0;
    let dailyLongOpenInterest = 0;
    let dailyShortOpenInterest = 0;

    if (query === historicalDataDerivatives) {
      const tradingStats: IGraphResponseOI = await request(
        endpoints[chain],
        historicalOI,
        {
          id: String(dayTimestamp) + ":daily",
          period: "daily",
        }
      );
      dailyOpenInterest =
        Number(tradingStats.tradingStats[0]?.longOpenInterest || 0) +
        Number(tradingStats.tradingStats[0]?.shortOpenInterest || 0);
      dailyLongOpenInterest = Number(
        tradingStats.tradingStats[0]?.longOpenInterest || 0
      );
      dailyShortOpenInterest = Number(
        tradingStats.tradingStats[0]?.shortOpenInterest || 0
      );
    }

    return {
      timestamp: dayTimestamp,
      dailyLongOpenInterest: dailyLongOpenInterest
        ? String(dailyLongOpenInterest * 10 ** -30)
        : undefined,
      dailyShortOpenInterest: dailyShortOpenInterest
        ? String(dailyShortOpenInterest * 10 ** -30)
        : undefined,
      dailyOpenInterest: dailyOpenInterest
        ? String(dailyOpenInterest * 10 ** -30)
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
    "derivatives": Object.keys(endpoints).reduce((acc, chain) => {
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
