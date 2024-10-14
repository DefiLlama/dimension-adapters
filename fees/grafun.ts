import { request, gql } from "graphql-request";

import { CHAIN } from "../helpers/chains";
import type { FetchV2, Adapter } from "../adapters/types";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: "https://api.studio.thegraph.com/query/77001/grafun-prod/v1.0.5"
}

const methodology = {
  Fees: "Sum of all fees from Token Sale Factory smart contract.",
  Revenue: "Sum of all revenue from Token Sale Factory smart contract.",
}

const query = gql`
  query get_daily_stats($date: String!) {
    dailyStatistics_collection( where: { date: $date } ) {
      cumulativeFeesBNB
      cumulativeRevenueBNB
      cumulativeTradingVolumeBNB
    }
  }
`;

const fetch: FetchV2 = async ({ chain, startTimestamp, ...restOpts }) => {
  const startFormatted = new Date(startTimestamp * 1000).toISOString().split("T")[0]

  const graphRes = await request(endpoints[chain], query, { date: startFormatted });
  if(!graphRes?.dailyStatistics_collection || graphRes?.dailyStatistics_collection.length === 0) {
    return {}
  }

  const dayItem = graphRes.dailyStatistics_collection[0]

  const dailyFees = restOpts.createBalances();
  const dailyRevenue = restOpts.createBalances();
  const dailyVolume = restOpts.createBalances();

  dailyFees.addGasToken(dayItem.cumulativeFeesBNB);
  dailyRevenue.addGasToken(dayItem.cumulativeRevenueBNB);
  dailyVolume.addGasToken(dayItem.cumulativeTradingVolumeBNB);

  return {
    timestamp: restOpts.startOfDay,

    dailyFees,
    dailyRevenue,

    dailyVolume,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      start: 1727417433,
      fetch,
      meta: { methodology }
    },
  },

}

export default adapter;
