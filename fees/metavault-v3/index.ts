import { gql, request } from "graphql-request";
import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/55804/linea-v3/version/latest",
  [CHAIN.SCROLL]:
    "https://api.studio.thegraph.com/query/55804/metavault-v3/version/latest",
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
    dailyFees: finalDailyFee,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.LINEA, CHAIN.SCROLL],
  start: '2024-03-01',
  methodology: {
    Fees: "Fees collected from user trading fees",
  },
};

export default adapter;
