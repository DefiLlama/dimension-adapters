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
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dailyData = await request(endpoints[chain], query, {
      id: dayTimestamp.toString(),
    });

    const totalData = await request(endpoints[chain], query, {
      id: "total",
    });

    let dailyOpenInterest = 0;
    let dailyLongOpenInterest = 0;
    let dailyShortOpenInterest = 0;

    if (query === historicalDataDerivatives) {
      const tradingStats = await request(endpoints[chain], historicalOI, {
        id: dayTimestamp.toString(),
      });

      if (tradingStats.tradingStat) {
        dailyLongOpenInterest = Number(tradingStats.tradingStat.longOpenInterest || 0);
        dailyShortOpenInterest = Number(tradingStats.tradingStat.shortOpenInterest || 0);
        dailyOpenInterest = dailyLongOpenInterest + dailyShortOpenInterest;
      }
    }

    const DECIMALS = 30;
    
    return {
      timestamp: dayTimestamp,
      dailyLongOpenInterest: dailyLongOpenInterest ? String(dailyLongOpenInterest * 10 ** -DECIMALS) : undefined,
      dailyShortOpenInterest: dailyShortOpenInterest ? String(dailyShortOpenInterest * 10 ** -DECIMALS) : undefined,
      dailyOpenInterest: dailyOpenInterest ? String(dailyOpenInterest * 10 ** -DECIMALS) : undefined,
      dailyVolume: dailyData.volumeStat
        ? String(
            Number(
              Object.values(dailyData.volumeStat).reduce((sum, element) =>
                String(Number(sum) + Number(element))
              )
            ) * 10 ** -DECIMALS
          )
        : undefined,
      totalVolume: totalData.volumeStat
        ? String(
            Number(
              Object.values(totalData.volumeStat).reduce((sum, element) =>
                String(Number(sum) + Number(element))
              )
            ) * 10 ** -DECIMALS
          )
        : undefined,
    };
  };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1630368000,
  [CHAIN.AVAX]: 1640131200,
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
