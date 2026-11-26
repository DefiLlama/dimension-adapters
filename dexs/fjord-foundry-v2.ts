import { FetchOptions, SimpleAdapter } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const statsEndpoint = "https://fjord-api.vercel.app/api/daily-stats?version=2";

const v2ChainIDs: Record<string, number> = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.AVAX]: 43114,
    [CHAIN.BASE]: 8453,
    [CHAIN.BLAST]: 81457,
    [CHAIN.BSC]: 56,
};

const fetch = async ({ chain, startOfDay }: FetchOptions) => {
    const chainId = v2ChainIDs[chain];
    const { stats } = await fetchURL(statsEndpoint);

    const chainData = stats.evm.find((cd: any) => cd.chainId === chainId);
    if (!chainData) throw new Error(`Chain data not found for chainId: ${chainId}`);

    const dailyVolume = chainData.stats.find((dayItem: any) => dayItem.timestamp === startOfDay)?.volume;
    if (dailyVolume === undefined || dailyVolume === null) throw new Error(`Daily volume not found for timestamp: ${startOfDay}`);

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 1, // API publishes day D late on D+1, so the current-day v2 window never exists yet
    adapter: Object.fromEntries(Object.keys(v2ChainIDs).map((chain) => [chain, { fetch, start: '2023-12-18' }])),
};

export default adapter;
