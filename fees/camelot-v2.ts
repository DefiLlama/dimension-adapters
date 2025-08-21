import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getEnv } from "../helpers/env";

interface IPoolData {
  date: number;
  dailyFeeUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8zagLSufxk5cVhzkzai3tyABwJh53zxn9tmUYJcJxijG'),
  [CHAIN.APECHAIN]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-apechain/api`,
  [CHAIN.GRAVITY]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-gravity/api`,
  [CHAIN.RARI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-rari/api`,
  [CHAIN.REYA]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-reya/api`,
  [CHAIN.XDAI]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-xai/api`,
  [CHAIN.SANKO]: `https://subgraph.satsuma-prod.com/${getEnv('CAMELOT_API_KEY')}/camelot/camelot-ammv2-sanko/api`,
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const graphQuery = gql
    `
    {
      pairDayDatas(where:{date_gte:${options.fromTimestamp}, date_lte:${options.endTimestamp}, reserveUSD_gt:1000}, orderBy:dailyFeeUSD, orderDirection:desc) {
        id
        dailyFeeUSD
        reserveUSD
      }
    }
  `;

  const graphRes: IPoolData[] = (await request(endpoints[options.chain], graphQuery)).pairDayDatas;
  const dailyFeeUSD = graphRes;
  const dailyFee = dailyFeeUSD.reduce((acc, pool) => {
    return acc.plus(pool.dailyFeeUSD);
  }, new BigNumber(0));
  return {
    dailyFees: dailyFee.toString(),
    dailyUserFees: dailyFee.toString(),
    dailyRevenue: dailyFee.multipliedBy(0.4).toString(),
    dailyProtocolRevenue: dailyFee.multipliedBy(0.05).toString(),
    dailyHoldersRevenue: dailyFee.multipliedBy(0.35).toString(),
    dailySupplySideRevenue: dailyFee.multipliedBy(0.60).toString(),
  };

}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetch,
      start: '2022-11-11',
    },
    [CHAIN.APECHAIN]: {
      fetch: fetch,
      start: '2022-11-11',
    },
    [CHAIN.GRAVITY]: {
      fetch: fetch,
      start: '2022-11-11',
    },
    [CHAIN.RARI]: {
      fetch: fetch,
      start: '2022-11-11',
    },
    [CHAIN.REYA]: {
      fetch: fetch,
      start: '2022-11-11',
    },
    [CHAIN.XDAI]: {
      fetch: fetch,
      start: '2022-11-11',
    },
    [CHAIN.SANKO]: {
      fetch: fetch,
      start: '2022-11-11',
    },
  },
};

export default adapter;
