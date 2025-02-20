import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
  [CHAIN.CRONOS]:
    "https://graph.cronoslabs.com/subgraphs/name/fulcrom/stats-prod",
  [CHAIN.ERA]:
    "https://api.studio.thegraph.com/query/52869/stats-prod/version/latest",
  [CHAIN.CRONOS_ZKEVM]: "https://api.goldsky.com/api/public/project_clwrfupe2elf301wlhnd7bvva/subgraphs/fulcrom-stats-mainnet/prod/gn"
};

const methodology = {
  Fees: "Fees from open/close position (0.07% to 0.1%), swap (0.2% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  UserFees:
    "Fees from open/close position (0.07% to 0.1%), swap (0.2% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
  HoldersRevenue: "20% of all collected fees goes to FUL stakers",
  SupplySideRevenue: "60% of all collected fees goes to FLP holders",
  Revenue: "Revenue is 20% of all collected fees, which goes to FUL stakers",
  ProtocolRevenue: "Treasury has 20% revenue",
};

const graphs = (graphUrls: ChainEndpoints) => {
  return (chain: CHAIN) => {
    return async (timestamp: number) => {
      const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
      const searchTimestamp = "daily:" + todaysTimestamp;

      const graphQuery = gql`{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

      const totalGraphQuery = gql`
        {
          feeStat(id: "total") {
            mint
            burn
            marginAndLiquidation
            swap
          }
        }
      `;

      const graphRes = await request(graphUrls[chain], graphQuery);
      const totalRes = await request(graphUrls[chain], totalGraphQuery);

      const dailyFee =
        parseInt(graphRes.feeStat?.mint || 0) +
        parseInt(graphRes.feeStat?.burn || 0) +
        parseInt(graphRes.feeStat?.marginAndLiquidation || 0) +
        parseInt(graphRes.feeStat?.swap || 0);
      const finalDailyFee = dailyFee / 1e30;
      const totalFees =
        parseInt(totalRes.feeStat.mint) +
        parseInt(totalRes.feeStat.burn) +
        parseInt(totalRes.feeStat.marginAndLiquidation) +
        parseInt(totalRes.feeStat.swap);
      const finalTotalFee = totalFees / 1e30;

      const userFee =
        parseInt(graphRes.feeStat?.marginAndLiquidation || 0) +
        parseInt(graphRes.feeStat?.swap || 0);
      const finalUserFee = userFee / 1e30;

      return {
        timestamp,
        dailyFees: finalDailyFee.toString(),
        dailyUserFees: finalUserFee.toString(),
        dailyRevenue: (finalDailyFee * 0.2).toString(),
        dailyProtocolRevenue: (finalDailyFee * 0.2).toString(),
        totalProtocolRevenue: (finalTotalFee * 0.2).toString(),
        dailyHoldersRevenue: (finalDailyFee * 0.2).toString(),
        dailySupplySideRevenue: (finalDailyFee * 0.6).toString(),
      };
    };
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.CRONOS]: {
      fetch: graphs(endpoints)(CHAIN.CRONOS),
      start: '2023-02-27',
      meta: {
        methodology,
      },
    },
    [CHAIN.ERA]: {
      fetch: graphs(endpoints)(CHAIN.ERA),
      start: '2023-10-05',
      meta: {
        methodology,
      },
    },
    [CHAIN.CRONOS_ZKEVM]: {
      fetch: graphs(endpoints)(CHAIN.CRONOS_ZKEVM),
      start: '2024-08-15',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
