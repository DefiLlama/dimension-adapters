import request, { gql } from "graphql-request";
import { Adapter, ChainBlocks } from "../adapters/types";
import { getBlock } from "../helpers/getBlock";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfPreviousDayUTC,
} from "../utils/date";
import BigNumber from "bignumber.js";
import { CHAIN } from "../helpers/chains";
import { Chain } from "@defillama/sdk/build/general";

const STABLE_FEES = 0.0002;
const VOLATILE_FEES = 0.004;
const endpoint =
  "https://api.thegraph.com/subgraphs/name/solidlizardfinance/sliz";

interface IPair {
  id: string;
  isStable: boolean;
  volumeUSD: string;
}

interface IQuery  {
  yesterday: IPair[];
  today: IPair[];
}

const getFees = (chain: Chain) => {
  return async (timestamp: number, chainBlocks: ChainBlocks) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp);
    const todaysBlock = await getBlock(
      todaysTimestamp,
      chain,
      chainBlocks
    );
    const yesterdaysBlock = await getBlock(yesterdaysTimestamp, chain, {});

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
    const graphRes: IQuery = await request(endpoint, query);
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

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: getFees(CHAIN.ARBITRUM),
      start: 1675036800,
    },
  },
};

export default adapter;
