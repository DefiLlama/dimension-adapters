import { gql, request } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../../adapters/types";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoints = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cly4708cqpcj601tt7gzf1jdj/subgraphs/sparkdex-v3/latest/gn",
};

interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

const graphs = (graphUrls: ChainEndpoints) => {
  const fetch: FetchV2 = async ({ chain, startTimestamp }) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(startTimestamp);

    const graphQuery = gql`
    query MyQuery {
      feeStats(where: {timestamp: ${todaysTimestamp}, period: daily}) {
        cumulativeFeeUsd
        feeUsd
        id
      }
    }
  `;

    const graphRes = await request(graphUrls[chain], graphQuery);
    const feeStats: IFeeStat[] = graphRes.feeStats;

    let dailyFeeUSD = BigInt(0);
    let totalFeeUSD = BigInt(0);

    feeStats.forEach((fee) => {
      dailyFeeUSD += BigInt(fee.feeUsd);
      totalFeeUSD += BigInt(fee.cumulativeFeeUsd);
    });

    const finalDailyFee = parseInt(dailyFeeUSD.toString()) / 1e18;
    const finalTotalFee = parseInt(totalFeeUSD.toString()) / 1e18;

    return {
      timestamp: todaysTimestamp,
      dailyFees: finalDailyFee.toString(),
      totalFees: finalTotalFee.toString(),
    };
  };
  return fetch;
};

const methodology = {
  dailyFees: "Total cumulativeFeeUsd for specified chain for the given day",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.FLARE]: {
      fetch: graphs(endpoints),
      start: '2024-07-02',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
