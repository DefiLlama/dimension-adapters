import request, { gql } from "graphql-request";
import { getBlock } from "../../helpers/getBlock";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfPreviousDayUTC
} from "../../utils/date";
import BigNumber from "bignumber.js";

const endpoint = "https://api.goldsky.com/api/public/project_clmtie4nnezuh2nw6hhjg6mo7/subgraphs/mute_switch/v0.0.7/gn"

export const fetchV1 = () => {
  return async (timestamp: number) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp);
    const todaysBlock = await getBlock(
      todaysTimestamp,
      "era",
      {}
    );

    const yesterdaysBlock = await getBlock(yesterdaysTimestamp, "era", {});

    const query = gql`
      query fees {
        yesterday: pairs(block: {number: ${yesterdaysBlock}}, where: {volumeUSD_gt: "0"}, first: 1000, orderBy:volumeUSD, orderDirection:desc) {
          id
          stable
          pairFee
          volumeUSD
        }
        today: pairs(block: {number: ${todaysBlock}}, where: {volumeUSD_gt: "0"}, first: 1000, orderBy:volumeUSD, orderDirection:desc) {
          id
          stable
          pairFee
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

      dailyFee = dailyFee.plus(dailyVolume.times(pool.pairFee).div(10000))
    }

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.times(0.2).toString(),
    };
  };
};