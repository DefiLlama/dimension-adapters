import request, { gql, GraphQLClient } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const chainConfig: Record<string, { url: string, start: string }> = {
  [CHAIN.LIGHTLINK_PHOENIX]: {
    url: "https://graph.phoenix.lightlink.io/query/subgraphs/name/amped-finance/trades",
    start: "2024-06-01",
  },
  [CHAIN.SONIC]: {
    url: "https://gateway.thegraph.com/api/subgraphs/id/6hzdSJf3xaPxsRHCEqCfe9evk3xmmwB291ZJ9RoqgHfH",
    start: "2024-12-31",
  },
  // [CHAIN.BSC]: {
  //   url: "https://api.studio.thegraph.com/query/91379/amped-trades-bsc/version/latest",
  //   start: "2024-10-01",
  // },
  [CHAIN.BERACHAIN]: {
    url: "https://api.studio.thegraph.com/query/91379/amped-trades-bera/version/latest",
    start: "2025-02-06",
  },
  [CHAIN.BASE]: {
    url: "https://api.studio.thegraph.com/query/91379/trades-base/version/latest",
    start: "2025-02-20",
  },
  // [CHAIN.SSEED]: {
  //   url: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/superseed-trades/1.0.1/gn",
  //   start: "2025-04-22",
  // },
};

const historicalDataQuery = gql`
  query get_fees($period: String!, $id: String!) {
    feeStats(where: { period: $period, id: $id }) {
      liquidation
      margin
      swap
    }
  }
`;

interface IGraphResponse {
  feeStats: Array<{
    liquidation: string;
    margin: string;
    swap: string;
  }>;
}

const HoldersStartDate = 1753401600 // After TGE "2025-07-25" stakers are receiving revenue

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const dayTimestamp = options.startOfDay;
  const chain = chainConfig[options.chain];

  let dailyData: IGraphResponse;
  
  // Use bearer token authentication only for Sonic network
  if (options.chain === CHAIN.SONIC) {
    const client = createGraphQLClient(chain.url);
    dailyData = await client.request(historicalDataQuery, {
      id: String(dayTimestamp) + ":daily" ,
      period: "daily",
    });
  } else {
    // Use regular request for other networks
    dailyData = await request(chain.url, historicalDataQuery, {
      id: String(dayTimestamp) + ":daily" ,
      period: "daily",
    });
  }

  const dailyFees = dailyData.feeStats?.length == 1
    ? Number(
      Object.values(dailyData.feeStats[0]).reduce((sum, element) =>
        String(Number(sum) + Number(element))
      )
    ) * 10 ** -30
    : 0;

  let dailySupplySideRevenue = 0;
  let dailyHoldersRevenue = 0;
  if(dayTimestamp >= HoldersStartDate){
    dailySupplySideRevenue = dailyFees ? dailyFees * 0.7 : 0; // 70% to LPs
    dailyHoldersRevenue = dailyFees ? dailyFees * 0.3 : 0; // 30% to AMPED stakers
  }
  else{
    dailySupplySideRevenue = dailyFees || 0; // 100% to LPs before TGE
    dailyHoldersRevenue = 0; // 0% to AMPED stakers before TGE
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "Fees collected from trading, liquidation, and margin activities.",
  Revenue: "30% of the fees goes to AMPED stakers.",
  SupplySideRevenue: "70% of revenue is distributed to liquidity providers.",
  HoldersRevenue: "30% of revenue is distributed to AMPED stakers After TGE(25th July 2025).",
  ProtocolRevenue: "Protocol doesn't earn anything.",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology
};

export default adapter;