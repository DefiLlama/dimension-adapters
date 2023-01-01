import { Adapter } from "../adapters/types";
import { ARBITRUM, AVAX, ETHEREUM, OPTIMISM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import { getTimestampAtStartOfDayUTC, getTimestampAtStartOfPreviousDayUTC } from "../utils/date";

const endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/synthetixio-team/mainnet-main",
  [OPTIMISM]: "https://api.thegraph.com/subgraphs/name/synthetixio-team/optimism-main"
}

const methodology = {
  UserFees: "Users pay between 10-100 bps (0.1%-1%), usually 30 bps, whenever they exchange a synthetic asset (Synth)",
  HoldersRevenue: "Fees in the fee pool can be claimed by claimed proportionally by SNX stakers (note: rewards can also be claimed by SNX stakers, which are not included here)",
  Revenue: "Fees paid by user and claimed by SNX stakers",
  Fees: "Fees generated on each synthetic asset exchange, between 0.1% and 1% (usually 0.3%)",
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
      const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp)

      const graphQuery = gql`query totals($todaysTimestamp: Int!, $yesterdaysTimestamp: Int!, $product: String!){
        totals(first: 1000, orderBy: timestamp, orderDirection: desc, where: { period: 86400, bucketMagnitude: 0, synth: null, timestamp_lte: $todaysTimestamp, timestamp_gte: $yesterdaysTimestamp, product: $product }) {
          totalFeesGeneratedInUSD
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery, { todaysTimestamp, yesterdaysTimestamp, product: "exchange" });

      let dailyFee = graphRes.totals.reduce((accumulator: number, dailyTotal: any) => {
        return accumulator + Number(dailyTotal.totalFeesGeneratedInUSD)
      }, 0);

      const graphResOptimism = await request(graphUrls[chain], graphQuery, { todaysTimestamp, yesterdaysTimestamp, product: "futures" });

      dailyFee += graphResOptimism.totals.reduce((accumulator: number, dailyTotal: any) => {
        return accumulator + Number(dailyTotal.totalFeesGeneratedInUSD)
      }, 0);
      // Secondary incentives are not included https://docs.synthetix.io/incentives/#secondary-incentives
      return {
        timestamp,
        dailyUserFees: dailyFee.toString(),
        dailyFees: dailyFee.toString(),
        dailyRevenue: dailyFee.toString(),
        dailyHoldersRevenue: dailyFee.toString()
      };
    };
  };
};


const adapter: Adapter = {
  adapter: {
    [ETHEREUM]: {
      fetch: graphs(endpoints)(ETHEREUM),
      start: async () => 1653523200,
      meta: {
        methodology
      }
    },
    [OPTIMISM]: {
      fetch: graphs(endpoints)(OPTIMISM),
      start: async () => 1636606800,
      meta: {
        methodology
      }
    },
  }
}

export default adapter;
