import request, { gql, GraphQLClient } from "graphql-request";
import { Fetch, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.LIGHTLINK_PHOENIX]: "https://graph.phoenix.lightlink.io/query/subgraphs/name/amped-finance/trades",
  [CHAIN.SONIC]: "https://gateway.thegraph.com/api/subgraphs/id/6hzdSJf3xaPxsRHCEqCfe9evk3xmmwB291ZJ9RoqgHfH",
  // [CHAIN.BSC]: "https://api.studio.thegraph.com/query/91379/amped-trades-bsc/version/latest",
  [CHAIN.BERACHAIN]: "https://api.studio.thegraph.com/query/91379/amped-trades-bera/version/latest",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/91379/trades-base/version/latest",
  // [CHAIN.SSEED]: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/superseed-trades/1.0.2/gn",
};

// Hardcoded bearer token for The Graph decentralized network
const GRAPH_BEARER_TOKEN = "e8cbd58884ab58d21be68ac2c1e15a24";

// Create GraphQL client with bearer token authentication
const createGraphQLClient = (endpoint: string) => {
  return new GraphQLClient(endpoint, {
    headers: {
      Authorization: `Bearer ${GRAPH_BEARER_TOKEN}`,
    },
  });
};

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: { period: $period, id: $id }) {
      swap
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
  (chain: string): Fetch =>
    async (timestamp: number) => {
      const dayTimestamp = getUniqStartOfTodayTimestamp(
        new Date(timestamp * 1000)
      );

      let dailyData: IGraphResponse;

      // Use bearer token authentication only for Sonic network
      if (chain === CHAIN.SONIC) {
        const client = createGraphQLClient(endpoints[chain]);
        dailyData = await client.request(historicalDataSwap, {
          id: String(dayTimestamp) + ":daily" ,
          period: "daily",
        });
      } else {
        // Use regular request for other networks
        dailyData = await request(endpoints[chain], historicalDataSwap, {
          id: String(dayTimestamp) + ":daily" ,
          period: "daily",
        });
      }

      const dailyVolume = dailyData.volumeStats.length == 1
        ? Number(
          Object.values(dailyData.volumeStats[0]).reduce((sum, element) =>
            String(Number(sum) + Number(element))
          )
        ) * 10 ** -30
        : undefined;

      return {
        dailyVolume: dailyVolume !== undefined ? String(dailyVolume) : undefined,
      };
    };

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.LIGHTLINK_PHOENIX]: 1717199544,
  [CHAIN.SONIC]: 1735685544,
  // [CHAIN.BSC]: 1727740344,
  [CHAIN.BERACHAIN]: 1738882079,
  [CHAIN.BASE]: 1740056400,
  [CHAIN.SSEED]: 1745330400,
};

const methodology = {
  Fees: "Trading fees vary based on liquidity and market conditions",
  UserFees: "Users pay variable trading fees",
  Revenue: "No revenue is taken by the protocol",
  HoldersRevenue: "No revenue is distributed to token holders",
  ProtocolRevenue: "Protocol does not take any revenue",
  SupplySideRevenue: "100% of trading fees are distributed to liquidity providers",
};

const adapter: SimpleAdapter = {
  methodology,
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
