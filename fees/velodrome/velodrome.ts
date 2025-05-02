import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { FetchOptions } from "../../adapters/types";
import BigNumber from "bignumber.js";

const STABLE_FEES = 0.0002;
const VOLATILE_FEES = 0.0005;
const endpoint =
  sdk.graph.modifyEndpoint('2bam2XEb91cFqABFPSKj3RiSjpop9HvDt1MnYq5cDX5E');

export const fetchV1 = () => {
  return async ({ getToBlock, getFromBlock }: FetchOptions) => {
    const [toBlock, fromBlock] = await Promise.all([ getToBlock(), getFromBlock()])

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

// const adapter: Adapter = {
//   adapter: {
//     [OPTIMISM]: {
//       fetch: getFees(),
//       start: '2023-02-23', // TODO: Add accurate timestamp
//     },
//   },
// };

// export default adapter;
