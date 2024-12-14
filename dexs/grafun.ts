import { request, } from "graphql-request";

import { CHAIN } from "../helpers/chains";
import type { FetchV2, Adapter } from "../adapters/types";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: "https://api.studio.thegraph.com/query/77001/grafun-prod/v1.0.5",
  [CHAIN.ETHEREUM]: "https://api.studio.thegraph.com/query/77001/grafun-eth/version/latest",
}

const query = `
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

  const dailyVolume = restOpts.createBalances();

  dailyVolume.addGasToken(dayItem.cumulativeTradingVolumeBNB);

  return {
    timestamp: restOpts.startOfDay,
    dailyVolume,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      start: '2024-09-27',
      fetch,
    },
    [CHAIN.ETHEREUM]: {
      start: "2024-11-28",
      fetch,
    },
  },

}

export default adapter;
