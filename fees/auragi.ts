import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";

const STABLE_FEES = 0.0001;
const VOLATILE_FEES = 0.0005;
const endpoint = "https://api.thegraph.com/subgraphs/name/oxbill/auragi";

const getFees = () => {
  return async ({ getFromBlock, getToBlock}: FetchOptions) => {
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
    const todayVolume: { [id: string]: BigNumber } = {};
    const graphRes = await request(endpoint, query);
    let dailyFee = new BigNumber(0);
    for (const pool of graphRes["today"]) {
      todayVolume[pool.id] = new BigNumber(pool.volumeUSD);
    }

    for (const pool of graphRes["yesterday"]) {
      if (!todayVolume[pool.id]) continue;
      const dailyVolume = BigNumber(todayVolume[pool.id]).minus(
        pool.volumeUSD
      );
      if (pool.isStable) {
        dailyFee = dailyFee.plus(dailyVolume.times(STABLE_FEES));
      } else {
        dailyFee = dailyFee.plus(dailyVolume.times(VOLATILE_FEES));
      }
    }

    return {
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.toString(),
      dailyHoldersRevenue: dailyFee.toString(),
    };
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFees(),
      start: 1680627600,
    },
  },
};

export default adapter;
