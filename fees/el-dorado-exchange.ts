import * as sdk from "@defillama/sdk";
import { Chain } from "../adapters/types";
import { gql, request } from "graphql-request";
import type { ChainEndpoints } from "../adapters/types";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const endpoints:Record<string, string> = {
    // [CHAIN.BSC]: sdk.graph.modifyEndpoint('FiegiatdkorjPCvK72UyHvmJHvWtS3oQS6zwnR94Xe7c'),
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('G3wquxtaw68uX5GAZ7XBPWK8Fa7Buf66Y27uT8erqQZ4'),
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
    version: 1,
    deadFrom: "2024-12-14",
    adapter: {
        // [CHAIN.BSC]: {
        //     fetch: graphs(endpoints)(CHAIN.BSC),
        //     start: '2022-12-10',
        //     meta: {
        //         methodology: {
        //             Fees: "All mint, burn, margin and liquidation and swap fees are collected",
        //             UserFees: "Users pay swap fees and margin and liquidation fees",
        //             Revenue: "Revenue is calculated as 30% of the total fee.",
        //         }
        //     }
        // },
        [CHAIN.ARBITRUM]: {
            fetch: async (timestamp: number) => {return {timestamp}},
            start: '2023-03-07',
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
