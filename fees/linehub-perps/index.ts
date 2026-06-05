import { gql, request } from "graphql-request";
import type { ChainEndpoints, FetchOptions, FetchV2 } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/55804/linehub-trade/version/latest",
};

interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const graphQuery = gql`
    query MyQuery {
      feeStats(where: {timestamp: ${todaysTimestamp}, period: daily}) {
        cumulativeFeeUsd
        feeUsd
        id
      }
    }
  `;

  const graphRes = await request(endpoints[options.chain], graphQuery);
  const feeStats: IFeeStat[] = graphRes.feeStats;

  let dailyFeeUSD = BigInt(0);

  feeStats.forEach((fee) => {
    dailyFeeUSD += BigInt(fee.feeUsd);
  });

  const finalDailyFee = parseInt(dailyFeeUSD.toString()) / 1e18;

  return {
    timestamp: todaysTimestamp,
    dailyFees: finalDailyFee.toString(),
  };
};

const methodology = {
  Fees: "Total cumulativeFeeUsd for specified chain for the given day",
};

const adapter: Adapter = {
  version: 2,
  chains: [CHAIN.LINEA],
  fetch,
  start: '2024-07-02',
  deadFrom: '2025-10-31',
  methodology,
};

export default adapter;
