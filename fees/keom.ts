import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: Record<string, string> = {
  [CHAIN.POLYGON]:
    "https://api.studio.thegraph.com/query/39380/staging-keom-pos/version/latest",
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/39380/staging-keom-zkevm/version/latest",
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_clqpd6naegn6301uu9h0gd8qz/subgraphs/keom-subgraph/1.0.0/gn",
};

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const dateId = Math.floor(getTimestampAtStartOfDayUTC(timestamp) / 86400);

  const graphQuery = gql`{
    financialsDailySnapshot(id: ${dateId}) {
        cumulativeTotalRevenueUSD
        dailyTotalRevenueUSD
        cumulativeProtocolSideRevenueUSD
        dailyProtocolSideRevenueUSD
    }
  }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFee = Number(
    graphRes.financialsDailySnapshot?.dailyTotalRevenueUSD || '0'
  );
  const dailyRev = Number(
    graphRes.financialsDailySnapshot?.dailyProtocolSideRevenueUSD || '0'
  );

  return {
    dailyFees: dailyFee.toString(),
    dailyRevenue: dailyRev.toString(),
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: '2023-11-09',
    },
    // [CHAIN.POLYGON_ZKEVM]: {
    //   fetch, // error the graph is not available
    //   start: '2023-03-27',
    // },
    [CHAIN.MANTA]: {
      fetch,
      start: '2023-11-01',
    },
  },
};

export default adapter;
