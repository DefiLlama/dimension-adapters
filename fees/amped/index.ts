import request, { gql, GraphQLClient } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

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
  const { startOfDay, chain, createBalances } = options;
  const dayTimestamp = startOfDay;
  const chainInfo = chainConfig[chain];

  let dailyData: IGraphResponse;

  // Use bearer token authentication only for Sonic network
  if (chain === CHAIN.SONIC) {
    const client = createGraphQLClient(chainInfo.url);
    dailyData = await client.request(historicalDataQuery, {
      id: String(dayTimestamp) + ":daily" ,
      period: "daily",
    });
  } else {
    // Use regular request for other networks
    dailyData = await request(chainInfo.url, historicalDataQuery, {
      id: String(dayTimestamp) + ":daily" ,
      period: "daily",
    });
  }

  const dailyFees = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  if (dailyData.feeStats?.length == 1) {
    const stats = dailyData.feeStats[0];
    const swapFeesUSD = Number(stats.swap) * 10 ** -30;
    const marginFeesUSD = Number(stats.margin) * 10 ** -30;
    const liquidationFeesUSD = Number(stats.liquidation) * 10 ** -30;

    dailyFees.addCGToken("usd-coin", swapFeesUSD, METRIC.SWAP_FEES);
    dailyFees.addCGToken("usd-coin", marginFeesUSD, METRIC.MARGIN_FEES);
    dailyFees.addCGToken("usd-coin", liquidationFeesUSD, METRIC.LIQUIDATION_FEES);

    if(dayTimestamp >= HoldersStartDate){
      // After TGE: 70% to LPs, 30% to AMPED stakers
      dailySupplySideRevenue.addBalances(dailyFees.clone(0.7), METRIC.LP_FEES);
      dailyHoldersRevenue.addBalances(dailyFees.clone(0.3), "Staking Rewards");
    } else {
      // Before TGE: 100% to LPs
      dailySupplySideRevenue.addBalances(dailyFees, METRIC.LP_FEES);
    }
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

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees charged on token swaps on the Amped platform",
    [METRIC.MARGIN_FEES]: "Fees paid by traders for opening and maintaining margin positions",
    [METRIC.LIQUIDATION_FEES]: "Fees collected when undercollateralized positions are liquidated",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Portion of fees distributed to liquidity providers (100% before TGE on July 25, 2025; 70% after TGE)",
  },
  HoldersRevenue: {
    "Staking Rewards": "Portion of fees distributed to AMPED token stakers (0% before TGE on July 25, 2025; 30% after TGE)",
  },
};

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;