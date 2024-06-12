import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface IPoolData {
  id: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.ARBITRUM]: "https://gateway-arbitrum.network.thegraph.com/api/[api-key]/subgraphs/id/7mPnp1UqmefcCycB8umy4uUkTkFxMoHn1Y7ncBUscePp"
}

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const dateId = Math.floor(getTimestampAtStartOfDayUTC(todayTimestamp) / 86400)
    const graphQuery = gql
      `
      {
        algebraDayData(id: ${dateId}) {
          id
          feesUSD
        }
      }
    `;

    const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).algebraDayData;
    const dailyFeeUSD = graphRes;
    const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
    if (dailyFee === undefined) return { timestamp }
    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.2).toString(),
      dailyProtocolRevenue: dailyFee.multipliedBy(0.03).toString(),
      dailyHoldersRevenue: dailyFee.multipliedBy(0.17).toString(),
      dailySupplySideRevenue: dailyFee.multipliedBy(0.80).toString(),
    };
  };
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: 1680220800,
    },
  },
};

export default adapter;
