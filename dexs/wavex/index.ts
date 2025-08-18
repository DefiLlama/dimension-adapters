import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.SONEIUM]: "https://wavex-indexer-serve-mainnet.up.railway.app/",
};

const historicalDataSwap = gql`
  query get_volume($id: String!) {
    volumeStat(id: $id) {
      swap
    }
  }
`;

const historicalDataDerivatives = gql`
  query get_volume($id: String!) {
    volumeStat(id: $id) {
      liquidation
      margin
    }
  }
`;
const historicalOI = gql`
  query get_trade_stats($id: String!) {
    tradingStat(id: $id) {
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
  (chain: string): Fetch =>
  async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1000)
    );
    const dailyData = await request(endpoints[chain], query, {
      id: dayTimestamp.toString(),
    });

    let openInterestAtEnd = 0;
    let longOpenInterestAtEnd = 0;
    let shortOpenInterestAtEnd = 0;

    if (query === historicalDataDerivatives) {
      const tradingStats = await request(endpoints[chain], historicalOI, {
        id: dayTimestamp.toString(),
      });

      if (tradingStats.tradingStat) {
        longOpenInterestAtEnd = Number(
          tradingStats.tradingStat.longOpenInterest || 0
        );
        shortOpenInterestAtEnd = Number(
          tradingStats.tradingStat.shortOpenInterest || 0
        );
        openInterestAtEnd = longOpenInterestAtEnd + shortOpenInterestAtEnd;
      }
    }

    const DECIMALS = 30;

    return {
      timestamp: dayTimestamp,
      longOpenInterestAtEnd: longOpenInterestAtEnd
        ? String(longOpenInterestAtEnd * 10 ** -DECIMALS)
        : undefined,
      shortOpenInterestAtEnd: shortOpenInterestAtEnd
        ? String(shortOpenInterestAtEnd * 10 ** -DECIMALS)
        : undefined,
      openInterestAtEnd: openInterestAtEnd
        ? String(openInterestAtEnd * 10 ** -DECIMALS)
        : undefined,
      dailyVolume: dailyData.volumeStat
        ? String(
            Number(
              Object.values(dailyData.volumeStat).reduce((sum, element) =>
                String(Number(sum) + Number(element))
              )
            ) *
              10 ** -DECIMALS
          )
        : undefined,

    };
  };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.SONEIUM]: 1735286448,
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
