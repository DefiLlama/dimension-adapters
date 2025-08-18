import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints: ChainEndpoints = {
  [CHAIN.POLYGON_ZKEVM]:
    "https://api.studio.thegraph.com/query/55804/hydra-trade/version/latest",
  [CHAIN.MANTA]:
    "https://api.goldsky.com/api/public/project_cly4708cqpcj601tt7gzf1jdj/subgraphs/manta-trade/latest/gn",
};
interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

const fetch = (endpoint) => {
  return async (timestamp: number) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
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

    const response = await request(endpoint, graphQuery);
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
};

const adapter: Adapter = {
  version: 1,
  methodology: "All treasuryFee, poolFee and keeperFee are collected",
  adapter: {
    [CHAIN.POLYGON_ZKEVM]: {
      fetch: fetch(endpoints[CHAIN.POLYGON_ZKEVM]),
      start: '2024-01-01',
    },
    [CHAIN.MANTA]: {
      fetch: fetch(endpoints[CHAIN.MANTA]),
      start: '2024-01-01',
    },
  },
};

export default adapter;
