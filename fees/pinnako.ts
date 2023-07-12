import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints = {
    [CHAIN.ZKSYNC]: "https://api.studio.thegraph.com/query/49418/zkmain_stats/version/latest",

};

const graphs = (graphUrls: ChainEndpoints) => {
    return (chain: Chain) => {
        return async (timestamp: number) => {
            const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

            const graphQuery = gql`{
                feeStat(id: "${todaysTimestamp}",period: "daily") {
                    mint
                    burn
                    marginAndLiquidation
                    swap
                }
            }`;

            const graphRes = await request(graphUrls[chain], graphQuery);

            const dailyFee = (
                parseInt(graphRes.feeStat.mint) +
                parseInt(graphRes.feeStat.burn) +
                parseInt(graphRes.feeStat.marginAndLiquidation) +
                parseInt(graphRes.feeStat.swap)
            ) / 1e30
            const dailyUserFees = (
                parseInt(graphRes.feeStat.marginAndLiquidation) +
                parseInt(graphRes.feeStat.swap)
            ) / 1e30;

            return {
                timestamp,
                dailyFees: dailyFee.toString(),
                dailyUserFees: dailyUserFees.toString(),
                dailyRevenue: (dailyFee * 0.3).toString()
            };
        };
    };
};

const adapter: Adapter = {
    adapter: {
        [CHAIN.ZKSYNC]: {
            fetch: graphs(endpoints)(CHAIN.ZKSYNC),
            start: async () => 1670659200,
            meta: {
                methodology: {
                    Fees: "All mint, burn, margin and liquidation and swap fees are collected",
                    UserFees: "Users pay swap fees and margin and liquidation fees",
                    Revenue: "Revenue is calculated as 30% of the total fee.",
                }
            }
        },
    },
};

export default adapter;
