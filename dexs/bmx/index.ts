import request, { gql } from "graphql-request";
import {
  BreakdownAdapter,
  Fetch,
  FetchResultVolume,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import BigNumber from "bignumber.js";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;
const toString = (x: BigNumber) => {
  if (x.isEqualTo(0)) return undefined;
  return x.toString();
};

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
const freestyleQuery = gql`
  query stats($from: String!, $to: String!) {
    dailyHistories(
      where: {
        timestamp_gte: $from
        timestamp_lte: $to
        accountSource: "0x6D63921D8203044f6AbaD8F346d3AEa9A2719dDD"
      }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
    }
    totalHistories(
      where: { accountSource: "0x6D63921D8203044f6AbaD8F346d3AEa9A2719dDD" }
    ) {
      timestamp
      platformFee
      accountSource
      tradeVolume
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
        Number(tradingStats.tradingStats[0].longOpenInterest) +
        Number(tradingStats.tradingStats[0].shortOpenInterest);
      dailyLongOpenInterest = Number(
        tradingStats.tradingStats[0].longOpenInterest
      );
      dailyShortOpenInterest = Number(
        tradingStats.tradingStats[0].shortOpenInterest
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

const fetchFreestyleVolume =
  (query: string) =>
  (chain: string): Fetch =>
  async (timestamp: number): Promise<FetchResultVolume> => {
    const response: IGraphResponseFreestyle = await request(
      freestyleEndpoints[chain],
      query,
      {
        from: String(timestamp - ONE_DAY_IN_SECONDS),
        to: String(timestamp),
      }
    );

    let dailyVolume = new BigNumber(0);
    let totalVolume = new BigNumber(0);

    response.dailyHistories.forEach((data) => {
      dailyVolume = dailyVolume.plus(new BigNumber(data.tradeVolume));
    });
    response.totalHistories.forEach((data) => {
      totalVolume = totalVolume.plus(new BigNumber(data.tradeVolume));
    });

    dailyVolume = dailyVolume.dividedBy(new BigNumber(1e18));
    totalVolume = totalVolume.dividedBy(new BigNumber(1e18));

    const _dailyVolume = toString(dailyVolume);
    const _totalVolume = toString(totalVolume);

    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );

    return {
      timestamp: dayTimestamp,
      dailyVolume: _dailyVolume ?? "0",
      totalVolume: _totalVolume ?? "0",
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
    "derivatives-freestyle": {
      [CHAIN.BASE]: {
        fetch: fetchFreestyleVolume(freestyleQuery)(CHAIN.BASE),
        start: 1714681913,
      },
    },
  },
};

export default adapter;
