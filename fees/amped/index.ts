import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: Record<string, string> = {
  [CHAIN.LIGHTLINK_PHOENIX]: "https://graph.phoenix.lightlink.io/query/subgraphs/name/amped-finance/trades",
  [CHAIN.SONIC]: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/sonic-trades/1.0.6/gn",
  // [CHAIN.BSC]: "https://api.studio.thegraph.com/query/91379/amped-trades-bsc/version/latest"
  [CHAIN.BERACHAIN]: "https://api.studio.thegraph.com/query/91379/amped-trades-bera/version/latest",
  [CHAIN.BASE]: "https://api.studio.thegraph.com/query/91379/trades-base/version/latest",
  [CHAIN.SSEED]: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/superseed-trades/1.0.1/gn",
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

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(
    new Date(timestamp * 1000)
  );

  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalDataQuery, {
    id: String(dayTimestamp) + ":daily" ,
    period: "daily",
  });

  const dailyFees = dailyData.feeStats?.length == 1
    ? Number(
      Object.values(dailyData.feeStats[0]).reduce((sum, element) =>
        String(Number(sum) + Number(element))
      )
    ) * 10 ** -30
    : undefined;

  // Calculate revenue distribution
  const dailySupplySideRevenue = dailyFees ? dailyFees * 0.7 : undefined; // 70% to LPs
  const dailyProtocolRevenue = dailyFees ? dailyFees * 0.3 : undefined; // 30% to AMPED stakers
  const dailyRevenue = dailyFees; // Total protocol revenue

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Fees collected from trading, liquidation, and margin activities.",
  Revenue: "Protocol fees are distributed with 70% going to liquidity providers and 30% to AMPED stakers.",
  SupplySideRevenue: "70% of all protocol fees distributed to liquidity providers.",
  ProtocolRevenue: "30% of all protocol fees distributed to AMPED stakers.",
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.LIGHTLINK_PHOENIX]: {
      fetch,
      start: '2024-06-01',
      meta: { methodology },
    },
    [CHAIN.SONIC]: {
      fetch,
      start: '2024-12-31',
      meta: { methodology },
    },
    // [CHAIN.BSC]: {
    //   fetch,
    //   start: '2024-10-01',
    //   meta: { methodology },
    // },
    [CHAIN.BERACHAIN]: {
      fetch,
      start: '2025-02-06',
      meta: { methodology },
    },
    [CHAIN.BASE]: {
      fetch,
      start: '2025-02-20',
      meta: { methodology },
    },
    [CHAIN.SSEED]: {
      fetch,
      start: '2025-04-22',
      meta: { methodology },
    },
  }
};

export default adapter;
