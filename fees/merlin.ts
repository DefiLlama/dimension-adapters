import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, DISABLED_ADAPTER_KEY, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import disabledAdapter from "../helpers/disabledAdapter";

interface IPoolData {
  date: number;
  dailyFeeUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/45654/merlin-subgraph/v0.1.0"
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
          dailyFeeUSD
        }
      }
    `;

    const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).uniswapDayData;
    const dailyFeeUSD = graphRes;
    const dailyFee = dailyFeeUSD?.dailyFeeUSD ? new BigNumber(dailyFeeUSD.dailyFeeUSD) : undefined
    if (dailyFee === undefined) return { timestamp }

    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.05).toString(),
      dailyProtocolRevenue: dailyFee.multipliedBy(0.05).toString(),
      dailyHoldersRevenue: dailyFee.multipliedBy(0.35).toString(),
      dailySupplySideRevenue: dailyFee.multipliedBy(0.60).toString(),
    };
  };
}

const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.ERA]: {
      fetch: fetch(CHAIN.ERA),
      start: 1680274800,
    },
  },
};

export default adapter;
