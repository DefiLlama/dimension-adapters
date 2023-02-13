import { Adapter } from "../adapters/types";
import { ARBITRUM, AVAX, ETHEREUM, OPTIMISM } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from '@defillama/sdk/build/general';
import BigNumber from "bignumber.js";

const endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/synthetixio-team/mainnet-main",
  [OPTIMISM]: "https://api.thegraph.com/subgraphs/name/synthetixio-team/optimism-main"
}

const methodology = {
  UserFees: "Users pay between 10-100 bps (0.1%-1%), usually 30 bps, whenever they exchange a synthetic asset (Synth)",
  HoldersRevenue: "Fees in the fee pool can be claimed by proportionally by SNX stakers (note: rewards can also be claimed by SNX stakers, which are not included here)",
  Revenue: "Fees paid by user and claimed by SNX stakers",
  Fees: "Fees generated on each synthetic asset exchange, between 0.1% and 1% (usually 0.3%)",
}

const getDailyFee = async (timestamp: number, url: string, exchange: string) => {
  const from = timestamp - 60 * 60 * 24
  const to = timestamp

  const graphQuery = gql`{
    ${exchange}(
      orderBy:timestamp,
      orderDirection:desc,
      where:{timestamp_gt: ${from}, timestamp_lte: ${to}}
    )
    {
      feesInUSD
    }
  }`;

  const graphRes = await request(url, graphQuery);
  return graphRes[exchange].reduce((accumulator: number, dailyTotal: any) => {
    return accumulator + Number(dailyTotal.feesInUSD)
  }, 0);
}

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {

      const dailyFee = BigNumber(await getDailyFee(timestamp, graphUrls[chain], 'synthExchanges'))
        .plus(await getDailyFee(timestamp, graphUrls[chain], 'atomicSynthExchanges'))
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
