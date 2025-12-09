import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getEnv } from "../helpers/env";

interface IPoolData {
  id: number;
  feesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7mPnp1UqmefcCycB8umy4uUkTkFxMoHn1Y7ncBUscePp'),
  [CHAIN.APECHAIN]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-apechain/api`,
  [CHAIN.GRAVITY]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-gravity/api`,
  [CHAIN.RARI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-rari/api`,
  [CHAIN.REYA]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-reya/api`,
  [CHAIN.XDAI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-xai/api`,
  [CHAIN.SANKO]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv3-sanko/api`,
}

const fetch =  async (timestamp: number, _t: any, options: FetchOptions): Promise<FetchResultFees> => {
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

    const graphRes: IPoolData = (await request(endpoints[options.chain], graphQuery)).algebraDayData;
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
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2023-03-31',
    },
    // [CHAIN.APECHAIN]: {
    //   fetch: fetch,
    //   start: '2022-11-11',
    // },
    // [CHAIN.GRAVITY]: {
    //   fetch: fetch,
    //   start: '2022-11-11',
    // },
    // [CHAIN.RARI]: {
    //   fetch: fetch,
    //   start: '2022-11-11',
    // },
    // [CHAIN.REYA]: {
    //   fetch: fetch,
    //   start: '2022-11-11',
    // },
    // [CHAIN.XDAI]: {
    //   fetch: fetch,
    //   start: '2022-11-11',
    // },
    // [CHAIN.SANKO]: {
    //   fetch: fetch,
    //   start: '2022-11-11',
    // },
  },
};

export default adapter;
