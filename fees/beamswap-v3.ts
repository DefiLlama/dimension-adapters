import * as sdk from "@defillama/sdk";
import { Chain, FetchOptions } from "../adapters/types";
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
  [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('2YnTZfQmenjvJ3bihewLGgAKnyqjrMWrStux8ZFE7ee6'),
}

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
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

  const graphRes: IPoolData = (await request(endpoints[options.chain], graphQuery)).uniswapDayData;

  const dailyFeeUSD = graphRes;
  const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
  if (dailyFee === undefined) return { timestamp }

  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: dailyFee.multipliedBy(0.16).toString(),
    dailyProtocolRevenue: dailyFee.multipliedBy(0.16).toString(),
    dailyHoldersRevenue: dailyFee.multipliedBy(0.02).toString(),
    dailySupplySideRevenue: dailyFee.multipliedBy(0.84).toString(),
  };
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch,
      start: '2023-05-18',
    },
  },
};

export default adapter;
