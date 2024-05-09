import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPoolData {
  date: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.EVMOS]: "https://subgraph.satsuma-prod.com/09c9cf3574cc/orbital-apes/v3-subgraph/api",
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
    const graphQuery = gql
      `
      {
        uniswapDayData(id: ${dateId}) {
          id
          feesUSD
        }
      }
    `;

    const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).uniswapDayData;
    const dailyFeeUSD = graphRes;
    const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
    if (dailyFee === undefined) return { timestamp }
    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
    };
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.EVMOS]: {
      fetch: fetch(CHAIN.EVMOS),
      start: 1680480000,
    },
  },
};

export default adapter;
