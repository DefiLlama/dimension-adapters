import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const chainConfig: Record<string, { url: string, start: string }> = {
  [CHAIN.LIGHTLINK_PHOENIX]: {
    url: "https://graph.phoenix.lightlink.io/query/subgraphs/name/amped-finance/trades",
    start: "2024-06-01",
  },
  [CHAIN.SONIC]: {
    url: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/sonic-trades/1.0.6/gn",
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
  [CHAIN.SSEED]: {
    url: "https://api.goldsky.com/api/public/project_cm9j641qy0e0w01tzh6s6c8ek/subgraphs/superseed-trades/1.0.1/gn",
    start: "2025-04-22",
  },
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
  const chain = chainConfig[options.chain];

  const dailyData: IGraphResponse = await request(chain.url, historicalDataQuery, {
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

  const dailySupplySideRevenue = dailyFees ? dailyFees * 0.7 : undefined; // 70% to LPs
  const dailyHoldersRevenue = dailyFees ? dailyFees * 0.3 : undefined; // 30% to AMPED stakers

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
    dailyProtocolRevenue: 0,
  };
};

const methodology = {
  Fees: "Fees collected from trading, liquidation, and margin activities.",
  Revenue: "Revenue is distributed with 70% going to liquidity providers and 30% to AMPED stakers.",
  SupplySideRevenue: "70% of revenue is distributed to liquidity providers.",
  HoldersRevenue: "30% of revenue is distributed to AMPED stakers.",
  ProtocolRevenue: "Protocol doesn't earn anything.",
}

const adapter: Adapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  methodology
};

export default adapter;