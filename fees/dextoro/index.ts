import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const fetch = async (timestamp: number, chainBlocks: any, options: FetchOptions) => {
    // source: https://dune.com/0xvitalii/dextoro-stats - created Optimized version of the official stats query.
    const start = new Date(options.startTimestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
    const end = new Date(options.endTimestamp * 1000).toISOString().slice(0, 16).replace('T', ' ');
    // console.log(start, end);
    const value = (await queryDune("4888269", {
        start,
        end,
    }));
    // console.log(value);
    const dailyFees = value[0].fees ? value[0].fees : 0;

    return { dailyFees, dailyRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.OPTIMISM]: {
            fetch: fetch,
            start: '2023-11-08'
        },
    },
    isExpensiveAdapter: true
};

export default adapter;
