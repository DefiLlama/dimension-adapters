import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const blacklistTokens = [
    "0xaafb102dd0902f5055cadecd687fb5b71ca82ef0e0285d90afde828ec58ca96b::btc::BTC", // wBTC -> wrong pricing from bluefin
];

const fetch = async (_options: FetchOptions) => {
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
        const tokenA = pool.tokenA?.info?.address;
        const tokenB = pool.tokenB?.info?.address;
        if (blacklistTokens.includes(tokenA) || blacklistTokens.includes(tokenB)) continue;

        dailyVolume += Number(pool.day.volume);
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SUI],
    start: '2024-11-19',
    runAtCurrTime: true,
};

export default adapter;
