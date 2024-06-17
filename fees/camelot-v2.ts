import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import BigNumber from "bignumber.js";
import request, { gql } from "graphql-request";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

interface IPoolData {
  date: number;
  dailyFeeUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('CnzVKhPQizzxSpysSveSLt1XZqkBRSprFtFJv3RaBQPv')
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
      start: 1668124800,
    },
  },
};

export default adapter;
