import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const STABLE_FEES = 0.0001;
const VOLATILE_FEES = 0.002;
const endpoint = "https://eon-graph.horizenlabs.io/subgraphs/name/Ascent/ascent-subgraph";

interface IPair {
  id: string;
  volumeUSD: string;
  isStable: boolean;
}

interface IGraphResponse {
  today: IPair[];
  yesterday: IPair[];
}
const getFees = () => {
  return async ({ getFromBlock, getToBlock }: FetchOptions) => {
    const [fromBlock, toBlock] = await Promise.all([getFromBlock(), getToBlock()])

    const query = gql`
      query fees {
        yesterday: pairs(block: {number: ${fromBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
        today: pairs(block: {number: ${toBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
      }
    `;

    const graphRes: IGraphResponse = await request(endpoint, query);
    const totalFeesToday = graphRes.today.reduce((acc, pool) => {
      if (pool.isStable) {
        return acc.plus(new BigNumber(pool.volumeUSD).times(STABLE_FEES));
      } else {
        return acc.plus(new BigNumber(pool.volumeUSD).times(VOLATILE_FEES));
      }
    }, new BigNumber(0));

    const totalFeesYesterday = graphRes.yesterday.reduce((acc, pool) => {
      if (pool.isStable) {
        return acc.plus(new BigNumber(pool.volumeUSD).times(STABLE_FEES));
      } else {
        return acc.plus(new BigNumber(pool.volumeUSD).times(VOLATILE_FEES));
      }
    }, new BigNumber(0));
    const dailyFee = totalFeesToday.minus(totalFeesYesterday);

    return {
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.32).toString(),
    };
  };
};


const adapter: SimpleAdapter = {
  deadFrom: '2025-05-05',  // EON chain is deprecated
  version: 2,
  adapter: {
    [CHAIN.EON]: {
      fetch: getFees(),
      start: '2023-11-01',
    }
  },
  methodology: {
    UserFees: "User pays 0.05%, 0.30%, or 1% on each swap."
  }
}




export default adapter;
