import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultFees, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPairDayData {
  id: string;
  dailyVolumeUSD: string;
}

interface IPair {
  id: string;
  isStable: boolean;
}

type IURL = {
  [l: string | Chain]: string;
};
interface IPair {
  id: string;
  volumeUSD: string;
  isStable: boolean;
}

interface IGraphResponse {
  today: IPair[];
  yesterday: IPair[];
}
const STABLE_FEES = 0.0001;
const VOLATILE_FEES = 0.0025;

const endpoints: IURL = {
  [CHAIN.LINEA]:
    "https://api.studio.thegraph.com/query/59052/lynex-v1/version/latest",
};

const fetch = async ({ getFromBlock, getToBlock, chain}: FetchOptions): Promise<FetchResultV2> => {
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

    const graphRes: IGraphResponse = await request(endpoints[chain], query);
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
      dailyRevenue: dailyFee.toString(),
      dailyHoldersRevenue: dailyFee.toString(),
    };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.LINEA]: {
      fetch: fetch,
      start: 1691394680,
    },
  },
};

export default adapter;
