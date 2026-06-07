import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../../adapters/types";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/55804/linea-trade/version/latest",
  [CHAIN.POLYGON]:
    sdk.graph.modifyEndpoint('GAvL1WKMAVDdnSk96qvmSCMwL6pxfhAVYkQw6AgZU3td'),
};
interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

const fetch = async (options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.toTimestamp);
  const period = "daily";

  const graphQuery = gql`{
        feeStats(where: {timestamp: ${todaysTimestamp}, period: "${period}"}) {
          id
          timestamp
          period
          cumulativeFee
          cumulativeFeeUsd
          feeUsd
        }
      }`;

  const response = await request(endpoints[options.chain], graphQuery);
  const feeStats: IFeeStat[] = response.feeStats;

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

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.LINEA, CHAIN.POLYGON],
  start: '2024-03-01',
  methodology: {
    Fees: "All treasuryFee, poolFee and keeperFee are collected",
  },
  deadFrom: "2025-06-04",
};

export default adapter;
