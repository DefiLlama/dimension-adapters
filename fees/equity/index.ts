import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../../adapters/types";
import { gql, request } from "graphql-request";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('9USQeMVzzBbxsXhQUmCk5fZursvL9Vj3cv8joYNXeKt9'),
};

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);
  const searchTimestamp = todaysTimestamp + ":daily";

  const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

  const graphRes = await request(endpoints[options.chain], graphQuery);

  const dailyFee =
    parseInt(graphRes.feeStat?.mint || 0) +
    parseInt(graphRes.feeStat?.burn || 0) +
    parseInt(graphRes.feeStat?.marginAndLiquidation || 0) +
    parseInt(graphRes.feeStat?.swap || 0);
  const finalDailyFee = dailyFee / 1e30;

  return {  // 100.00% of All & Any Fees generated goes to veEQUAL voters
    dailyFees: finalDailyFee.toString(),
    dailyRevenue: finalDailyFee.toString(),
  };
};

const adapter: Adapter = {
  version: 1,
  chains: [CHAIN.FANTOM],
  fetch,
  start: '2023-07-19',
  deadFrom: "2025-08-12",
  methodology: {
    Fees: '100.00% of All & Any Fees generated from All activity on Any Equity Platform Product goes solely to veEQUAL voters.',
    Revenue: '100.00% of All & Any Fees generated from All activity on Any Equity Platform Product goes solely to veEQUAL voters.',
  }
};

export default adapter;
