import request, { gql } from "graphql-request";
import { Adapter, ChainBlocks } from "../adapters/types";
import { getBlock } from "../helpers/getBlock";
import {
  getTimestampAtStartOfDayUTC,
  getTimestampAtStartOfPreviousDayUTC,
} from "../utils/date";
import BigNumber from "bignumber.js";
import { OPTIMISM } from "../helpers/chains";

const STABLE_FEES = 0.0002;
const VOLATILE_FEES = 0.0005;
const endpoint =
  "https://api.thegraph.com/subgraphs/name/ethzoomer/velodrome-trading-data";

const getFees = () => {
  return async (timestamp: number, chainBlocks: ChainBlocks) => {
    const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
    const yesterdaysTimestamp = getTimestampAtStartOfPreviousDayUTC(timestamp);
    const todaysBlock = await getBlock(
      todaysTimestamp,
      "optimism",
      chainBlocks
    );
    const yesterdaysBlock = await getBlock(yesterdaysTimestamp, "optimism", {});

    const query = gql`
      query fees {
        yesterday: dexAmmProtocols(block: {number: ${yesterdaysBlock}}) {
          pools {
            id
            _stable
            cumulativeVolumeUSD
          }
        }
        today: dexAmmProtocols(block: {number: ${todaysBlock}}) {
          pools {
            id
            _stable
            cumulativeVolumeUSD
          }
        }
      }
    `;
    const todayVolume: { [id: string]: BigNumber } = {};
    const graphRes = await request(endpoint, query);
    let dailyFee = new BigNumber(0);
    for (const pool of graphRes["today"][0].pools) {
      todayVolume[pool.id] = new BigNumber(pool.cumulativeVolumeUSD);
    }

    for (const pool of graphRes["yesterday"][0].pools) {
      if (!todayVolume[pool.id]) continue;
      const dailyVolume = BigNumber(todayVolume[pool.id]).minus(
        pool.cumulativeVolumeUSD
      );
      if (pool._stable) {
        dailyFee = dailyFee.plus(dailyVolume.times(STABLE_FEES));
      } else {
        dailyFee = dailyFee.plus(dailyVolume.times(VOLATILE_FEES));
      }
    }

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyRevenue: dailyFee.toString(),
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [OPTIMISM]: {
      fetch: getFees(),
      start: async () => 1676937600, // TODO: Add accurate timestamp
    },
  },
};

export default adapter;
