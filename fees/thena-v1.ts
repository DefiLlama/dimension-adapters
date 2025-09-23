import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { getBlock } from "../helpers/getBlock";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfPreviousDayUTC
} from "../utils/date";
import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";

const STABLE_FEES = 0.0001;
const VOLATILE_FEES = 0.002;
const endpoint =
  sdk.graph.modifyEndpoint('FKEt2N5VmSdEYcz7fYLPvvnyEUkReQ7rvmXzs6tiKCz1');

const getFees = () => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp);
    const todaysBlock = await getBlock(
      todaysTimestamp,
      "bsc",
      {}
    );
    const yesterdaysBlock = await getBlock(yesterdaysTimestamp, "bsc", {});

    const query = gql`
      query fees {
        yesterday: pairs(block: {number: ${yesterdaysBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
          id
          isStable
          volumeUSD
        }
        today: pairs(block: {number: ${todaysBlock}}, where: {volumeUSD_gt: "0"}, first: 1000) {
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
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.toString(),
      dailyHoldersRevenue: dailyFee.toString(),
    };
  };
};

const methodology = {
  Fees: "Fees collected from user trading fees",
  Revenue: "Fees go to veTHE voter (80%) and theNFT staker (20%)",
  HoldersRevenue: "Fees go to veTHE voter (80%) and theNFT staker (20%)"
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: getFees(),
      start: '2023-01-04',
    },
  },
  methodology
};

export default adapter;
