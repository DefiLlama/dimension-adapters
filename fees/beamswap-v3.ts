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
interface IFactoryData {
  id: number;
  totalFeesUSD: string;
}

type IURL = {
  [l: string | Chain]: string;
}

const endpoints: IURL = {
  [CHAIN.MOONBEAM]: "https://api.thegraph.com/subgraphs/name/beamswap/beamswap-v3",
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

    const graphQuery2 = gql
      `
      {
        factory(id: "0xD118fa707147c54387B738F54838Ea5dD4196E71") {
           id
          totalFeesUSD
        
        }
      }
  `;

    const graphRes: IPoolData = (await request(endpoints[chain], graphQuery)).uniswapDayData;
    const graphRes2: IFactoryData = (await request(endpoints[chain], graphQuery2)).factory;
    const totalFeesUSD = graphRes2;
    const totalFee = totalFeesUSD?.totalFeesUSD ? new BigNumber(totalFeesUSD.totalFeesUSD) : undefined
    const dailyFeeUSD = graphRes;
    const dailyFee = dailyFeeUSD?.feesUSD ? new BigNumber(dailyFeeUSD.feesUSD) : undefined
    if (dailyFee === undefined) return { timestamp }
    if (totalFee === undefined) return { timestamp }
    return {
      timestamp,
      dailyFees: dailyFee.toString(),
      dailyUserFees: dailyFee.toString(),
      dailyRevenue: dailyFee.multipliedBy(0.16).toString(),
      dailyProtocolRevenue: dailyFee.multipliedBy(0.16).toString(),
      dailyHoldersRevenue: dailyFee.multipliedBy(0.02).toString(),
      dailySupplySideRevenue: dailyFee.multipliedBy(0.84).toString(),
      totalFees: totalFee.toString(),
      totalProtocolRevenue: totalFee.multipliedBy(0.16).toString(),
      totalRevenue: totalFee.multipliedBy(0.16).toString(),
      totalUserFees: totalFee.toString(),
      totalSupplySideRevenue: totalFee.multipliedBy(0.84).toString(),

    };
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch: fetch(CHAIN.MOONBEAM),
      start: 1684397388,
    },
  },
};

export default adapter;
