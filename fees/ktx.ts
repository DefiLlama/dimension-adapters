import { BSC, MANTLE, ARBITRUM } from "../helpers/chains";
import { Adapter } from "../adapters/types";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [BSC]: "https://subgraph.ktx.finance/subgraphs/name/ktx",
  [MANTLE]: "https://mantlesubgraph.ktx.finance/subgraphs/name/ktx",
  [ARBITRUM]: "https://arbisubgraph.ktx.systems/subgraphs/name/ktx",
};

const methodology = {
  Fees: "Fees from open/close position (based on token utilization, capped at 0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees:
    "Fees from open/close position (based on token utilization, capped at 0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "30% of all collected fees goes to KTC stakers",
  SupplySideRevenue: "70% of all collected fees goes to KLP holders",
  Revenue: "Revenue is 30% of all collected fees, which goes to KTC stakers",
  ProtocolRevenue: "Treasury has no revenue",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: Chain) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const searchTimestamp =
        chain == "bsc" || chain == "mantle" || chain == "arbitrum"
          ? todaysTimestamp
          : todaysTimestamp + ":daily";

      const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

      const graphRes = await request(graphUrls[chain], graphQuery);

      const dailyFee =
        parseInt(graphRes.feeStat.mint) +
        parseInt(graphRes.feeStat.burn) +
        parseInt(graphRes.feeStat.marginAndLiquidation) +
        parseInt(graphRes.feeStat.swap);
      const finalDailyFee = dailyFee / 1e30;
      const userFee =
        parseInt(graphRes.feeStat.marginAndLiquidation) +
        parseInt(graphRes.feeStat.swap);
      const finalUserFee = userFee / 1e30;

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
        dailyRevenue: (finalDailyFee * 0.3).toString(),
        dailyProtocolRevenue: "0",
        totalProtocolRevenue: "0",
        dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
        dailySupplySideRevenue: (finalDailyFee * 0.7).toString(),
      };
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [BSC]: {
      fetch: graphs(endpoints)(BSC),
      start: 1682870400,
      meta: {
        methodology,
      },
    },
    [MANTLE]: {
      fetch: graphs(endpoints)(MANTLE),
      start: 1693843200,
      meta: {
        methodology,
      },
    },
    [ARBITRUM]: {
      fetch: graphs(endpoints)(ARBITRUM),
      start: 1705248000,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
