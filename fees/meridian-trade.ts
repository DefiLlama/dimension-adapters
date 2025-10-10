import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request, gql } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types"
import { Chain } from  "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
    [CHAIN.BASE]: "https://subgraph.meridianfinance.net/subgraphs/name/perpetuals-stats"
}

const methodology = {
    Fees: "Fees from open/close position (0.1%), swap (0.25% to 0.8%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
    UserFees: "Fees from open/close position (0.1%), swap (0.25% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.01%)",
    HoldersRevenue: "30% of all collected fees goes to Meridian stakers",
    SupplySideRevenue: "60% of all collected fees goes to MLP holders",
    Revenue: "Revenue is 40% of all collected fees, 75% of revenue goes to Meridian stakers",
    ProtocolRevenue: "Treasury receives 10% of all collected fees"
}

const graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number) => {
            const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp)
            const searchTimestamp = chain == "base" ? todaysTimestamp : todaysTimestamp + ":daily"

            const graphQuery = gql
                `{
        feeStat(id: "${searchTimestamp}") {
          mint
          burn
          marginAndLiquidation
          swap
        }
      }`;

            const graphRes = await request(graphUrls[chain], graphQuery);

            const dailyFee = parseInt(graphRes.feeStat.mint) + parseInt(graphRes.feeStat.burn) + parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap)
            const finalDailyFee = (dailyFee / 1e30);
            const userFee = parseInt(graphRes.feeStat.marginAndLiquidation) + parseInt(graphRes.feeStat.swap)
            const finalUserFee = (userFee / 1e30);

            return {
                timestamp,
                dailyFees: finalDailyFee.toString(),
                dailyUserFees: finalUserFee.toString(),
                dailyRevenue: (finalDailyFee * 0.4).toString(),
                dailyProtocolRevenue: (finalDailyFee * 0.1).toString(),
                dailyHoldersRevenue: (finalDailyFee * 0.3).toString(),
                dailySupplySideRevenue: (finalDailyFee * 0.6).toString(),
            };
        };
    };
};


const adapter: Adapter = {
    adapter: {
        [CHAIN.BASE]: {
            fetch: graphs(endpoints)(CHAIN.BASE),
            start: '2023-08-12',
        },
    },
    methodology
}

export default adapter;
