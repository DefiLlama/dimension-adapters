import * as sdk from "@defillama/sdk";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchOptions } from "../adapters/types";
import { Chain } from "../adapters/types";
import BigNumber from "bignumber.js";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints:Record<string, string> = {
  [CHAIN.POLYGON]:
    sdk.graph.modifyEndpoint('DRe1wuJiBQK3SWBQwah7sovvTRqBeqNrkzWNjjoWinh9'),
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/30443/0vix-zkevm/v0.0.1",
};

const fetch = async (timestamp: number, _a:any, options: FetchOptions) => {
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

  const dailyFee = new BigNumber(
    graphRes.financialsDailySnapshot.dailyTotalRevenueUSD
  );
  const dailyRev = new BigNumber(
    graphRes.financialsDailySnapshot.dailyProtocolSideRevenueUSD
  );

  return {
    dailyFees: dailyFee.toString(),
    dailyRevenue: dailyRev.toString(),
  };
};

const adapter: Adapter = {
  deadFrom: "2023-12-14",
  adapter: {
    [CHAIN.POLYGON]: {
      fetch,
      start: '2022-03-24',
    },
    // [CHAIN.POLYGON_ZKEVM]: {
    //   fetch,
    //   start: '2023-03-27',
    // },
  },
};

export default adapter;
