import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";


const adapter: Adapter = {
    version: 1,
    deadFrom: "2024-12-14",
    adapter: {
        // [CHAIN.BSC]: {
        //     fetch: graphs(endpoints)(CHAIN.BSC),
        //     start: '2022-12-10',
        // },
        [CHAIN.ARBITRUM]: {
            fetch: async (timestamp: number) => { return { timestamp } },
            start: '2023-03-07',
        },
    },
    methodology: {
        Fees: "All mint, burn, margin and liquidation and swap fees are collected",
        UserFees: "Users pay swap fees and margin and liquidation fees",
        Revenue: "Revenue is calculated as 30% of the total fee.",
    }
};

export default adapter;
