import { Chain } from "@defillama/sdk/build/general";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Adapter, DISABLED_ADAPTER_KEY } from "../adapters/types";
import { ARBITRUM } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import disabledAdapter from "../helpers/disabledAdapter";

const endpoints = {
    // [BSC]: "https://api.thegraph.com/subgraphs/name/metaverseblock/ede_stats_elpall_test",
    [ARBITRUM]: "https://api.thegraph.com/subgraphs/name/metaverseblock/ede_state_elp1_arbitrimone",
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
                parseInt(graphRes.feeStat?.mint || 0) +
                parseInt(graphRes.feeStat?.burn || 0) +
                parseInt(graphRes.feeStat?.marginAndLiquidation || 0) +
                parseInt(graphRes.feeStat?.swap || 0)
            ) / 1e30
            const dailyUserFees = (
                parseInt(graphRes.feeStat?.marginAndLiquidation || 0) +
                parseInt(graphRes.feeStat?.swap || 0)
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
        [DISABLED_ADAPTER_KEY]: disabledAdapter,
        // [BSC]: {
        //     fetch: graphs(endpoints)(BSC),
        //     start: 1670659200,
        //     meta: {
        //         methodology: {
        //             Fees: "All mint, burn, margin and liquidation and swap fees are collected",
        //             UserFees: "Users pay swap fees and margin and liquidation fees",
        //             Revenue: "Revenue is calculated as 30% of the total fee.",
        //         }
        //     }
        // },
        [ARBITRUM]: {
            fetch: async (timestamp: number) => {return {timestamp}},
            start: 1678147200,
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
