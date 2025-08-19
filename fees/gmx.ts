import { Adapter } from "../adapters/types";
import { ARBITRUM, AVAX } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints, FetchV2 } from "../adapters/types"
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints: any = {
  [ARBITRUM]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-arbitrum-stats/api",
  [AVAX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/gmx-avalanche-stats/api"
}

const methodology = {
  Fees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees: "Fees from open/close position (0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees goes to GMX stakers",
  SupplySideRevenue: "70% of all collected fees goes to GLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to GMX stakers",
  ProtocolRevenue: "Treasury has no revenue"
}

const graphs: FetchV2 = async ({ chain, endTimestamp }) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
  const searchTimestamp = chain == "arbitrum" ? todaysTimestamp : todaysTimestamp + ":daily"

  const graphQuery = gql
    `{
      feeStat(id: "${searchTimestamp}") {
        mint
        burn
        marginAndLiquidation
        swap
      }
    }`;

  const graphRes = await request(endpoints[chain], graphQuery);
  const dailyFee = parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn) + parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap)
  const finalDailyFee = (dailyFee / 1e30);
  const userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap)
  const finalUserFee = (userFee / 1e30);

  return {
    dailyFees: finalDailyFee.toString(),
    dailyUserFees: finalUserFee.toString(),
    dailyRevenue: (finalDailyFee * 0.3).toString(),
    dailyProtocolRevenue: "0",
    dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
    dailySupplySideRevenue: (finalDailyFee * 0.7).toString(),
  };
};


const adapter: Adapter = {
  methodology,
  version: 2,
  adapter: {
    [ARBITRUM]: {
      fetch: graphs,
      start: '2021-09-01',
    },
    [AVAX]: {
      fetch: graphs,
      start: '2022-01-06',
    },
  }
}

export default adapter;
