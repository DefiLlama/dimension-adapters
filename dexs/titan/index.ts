import { CHAIN } from "../../helpers/chains";
// import { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

// const poolsEndpoint = "https://api.titan.tg/beta/clmm/pools"
const statisticsEndpoint = "https://api.titan.tg/v1/statistics"

const fetch = async ({ fromTimestamp, toTimestamp }) => {
    // const pools = await httpGet(poolsEndpoint)
    const statistics = await httpGet(statisticsEndpoint, {
        params: {
            start: fromTimestamp,
            end: toTimestamp,
            dex: "Colossus",
        }
    })
    // const tvl = pools.reduce((acc, pool) => Number(acc) + Number(pool.tvl), 0)

    return {
        dailyVolume: statistics?.volumeUsd,
    };

};


const adapter: any = {
    version: 2,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2025-02-02',
        },
    },
};

export default adapter;
