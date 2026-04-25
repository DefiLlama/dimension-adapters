import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const fetch = async (_a: any, _b: any, _c: FetchOptions) => {
    const allPools: any[] = [];
    let page = 1;
    let hasMore = true;
    const maxPoolsPerPage = 100;

    while (hasMore) {
        const response = await fetchURL(`https://swap.api.sui-prod.bluefin.io/api/v1/pools/info?page=${page}&limit=${maxPoolsPerPage}`);
        const pools = Array.isArray(response) ? response : (response.data || response.pools || []);
        if (pools.length === 0) break;
        allPools.push(...pools);
        if (pools.length < maxPoolsPerPage) {
            hasMore = false;
        } else {
            const nextPage = response.nextPage || (response.data && response.data.nextPage);
            if (!nextPage) hasMore = false;
        }
        page++;
    }

    let dailyVolume = 0;
    for (const pool of allPools) {
        dailyVolume += Number(pool.day.volume);
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2024-11-19',
            runAtCurrTime: true
        },
    },
};

export default adapter;
