import request, { gql } from "graphql-request";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.LIGHTLINK_PHOENIX]:
    "https://graph.phoenix.lightlink.io/query/subgraphs/name/amped-finance/trades",
  [CHAIN.SONIC]:
    "https://api.studio.thegraph.com/query/91379/amped-trades-sonic/version/latest",
  // [CHAIN.BSC]: "https://api.studio.thegraph.com/query/91379/amped-trades-bsc/version/latest",
  [CHAIN.BERACHAIN]: "https://api.studio.thegraph.com/query/91379/amped-trades-berachain/version/latest"
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
          id: String(dayTimestamp) + ":daily" ,
          period: "daily",
        });
        const totalData: IGraphResponse = await request(endpoints[chain], query, {
          id: "total",
          period: "total",
        });

        const dailyVolume = dailyData.volumeStats.length == 1
          ? Number(
            Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
              String(Number(sum) + Number(element))
            )
          ) * 10 ** -30
          : undefined;

        const totalVolume = totalData.volumeStats.length == 1
          ? Number(
            Object.values(totalData.volumeStats[0]).reduce((sum, element) =>
              String(Number(sum) + Number(element))
            )
          ) * 10 ** -30
          : undefined;

        return {
          timestamp: dayTimestamp,
          dailyVolume: dailyVolume !== undefined ? String(dailyVolume) : undefined,
          totalVolume: totalVolume !== undefined ? String(totalVolume) : undefined,
        };
      };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.LIGHTLINK_PHOENIX]: 1717199544,

  [CHAIN.SONIC]: 1735685544,   
  // [CHAIN.BSC]: 1727740344, 
  [CHAIN.BERACHAIN]: 1738882079,
  [CHAIN.SONIC]: 1735685544,


};

const adapter: BreakdownAdapter = {
  breakdown: {
    swap: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataSwap)(chain),
          start: startTimestamps[chain],
          meta: {
            methodology: {
              Fees: "Trading fees vary based on liquidity and market conditions",
              UserFees: "Users pay variable trading fees",
              Revenue: "No revenue is taken by the protocol",
              HoldersRevenue: "No revenue is distributed to token holders",
              ProtocolRevenue: "Protocol does not take any revenue",
              SupplySideRevenue: "100% of trading fees are distributed to liquidity providers",
            },
          },
        },
      };
    }, {}),
    derivatives: Object.keys(endpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: getFetch(historicalDataDerivatives)(chain),
          start: startTimestamps[chain],
          meta: {
            methodology: {
              Fees: "Trading fees vary based on liquidity and market conditions",
              UserFees: "Users pay variable trading fees",
              Revenue: "No revenue is taken by the protocol",
              HoldersRevenue: "No revenue is distributed to token holders",
              ProtocolRevenue: "Protocol does not take any revenue",
              SupplySideRevenue: "100% of trading fees are distributed to liquidity providers",
            },
          },
        },
      };
    }, {}),
  },
};

export default adapter;
