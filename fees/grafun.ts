import * as sdk from "@defillama/sdk";
import { request, } from "graphql-request";
import { CHAIN } from "../helpers/chains";
import type { FetchV2, Adapter } from "../adapters/types";

const endpoints: { [key: string]: string } = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint("71DeFz7cWQPvf8zibkLUovwaeT67xNUZp3A5xecbpiz5"),
  [CHAIN.ETHEREUM]: "https://api.studio.thegraph.com/query/77001/grafun-eth/version/latest",
}

const methodology = {
  Fees: "Sum of all fees from Token Sale Factory smart contract.",
  Revenue: "Sum of all revenue from Token Sale Factory smart contract.",
}

// In case subgraph breaks, we can use this to get the fees from the wallet
// const FEE_WALLET_ADDRESSES = {
//   [CHAIN.BSC]: '0xD1995AB33C2712526983d8A2Cd0543D9fe835E05',
//   [CHAIN.ETHEREUM]: '0xc110f8a6d3ce547738c0c8eb93448c47f7155911'
// }


const fetch: FetchV2 = async ({ chain, startTimestamp, ...restOpts }) => {
  const startFormatted = new Date(startTimestamp * 1000).toISOString().split("T")[0]

  const query = `
    query get_daily_stats {
      dailyStatistics_collection( where: { date: "${startFormatted}" } ) {
        cumulativeFeesBNB
        cumulativeRevenueBNB
        cumulativeTradingVolumeBNB
      }
    }
  `;

  const graphRes = await request(endpoints[chain], query, { date: startFormatted });
  const dayItem = graphRes.dailyStatistics_collection[0]

  const dailyFees = restOpts.createBalances();
  const dailyRevenue = restOpts.createBalances();

  dailyFees.addGasToken(dayItem?.cumulativeFeesBNB || 0);
  dailyRevenue.addGasToken(dayItem?.cumulativeRevenueBNB || 0);

  return {
    dailyFees,
    dailyRevenue,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      start: '2024-09-27',
    },
    [CHAIN.ETHEREUM]: {
      start: "2024-11-28",
    },
  },
  fetch,
  methodology,
}

export default adapter;
