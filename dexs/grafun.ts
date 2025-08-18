import * as sdk from "@defillama/sdk";
import { request, } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import type { FetchV2, Adapter } from "../adapters/types";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint("71DeFz7cWQPvf8zibkLUovwaeT67xNUZp3A5xecbpiz5"),
  [CHAIN.ETHEREUM]: "https://api.studio.thegraph.com/query/77001/grafun-eth/version/latest",
}


const fetch: FetchV2 = async ({ chain, startTimestamp, ...restOpts }) => {
  const startFormatted = new Date(startTimestamp * 1000).toISOString().split("T")[0]
  const query = `
    query get_daily_stats{
      dailyStatistics_collection( where: { date: "${startFormatted}" } ) {
        date
        cumulativeTradingVolumeBNB
      }
    }
  `;

  const graphRes = await request(endpoints[chain], query, { date: startFormatted });

  const dayItem = graphRes.dailyStatistics_collection[0]
  const dailyVolume = restOpts.createBalances();
  dailyVolume.addGasToken(dayItem?.cumulativeTradingVolumeBNB || 0);

  return {
    dailyVolume
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
