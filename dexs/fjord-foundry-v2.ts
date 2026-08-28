import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const feeEndpointV2 = "https://fjord-api.vercel.app/api/daily-stats?version=2";

const v2ChainIDs: any = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.AVAX]: 43114,
    [CHAIN.BASE]: 8453,
    [CHAIN.BLAST]: 81457,
    [CHAIN.BSC]: 56,
};

const fetch = async (options: FetchOptions) => {
  const endTimestamp = options.toTimestamp;
  const chainId = v2ChainIDs[options.chain];
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpointV2))

    const chainData = historicalVolume.stats.evm.find((cd: any) => cd.chainId === chainId);
    if (!chainData) throw new Error(`Chain data not found for chainId: ${chainId}`);

    const dailyVolume = chainData.stats
        .find((dayItem: any) => dayItem.timestamp === dayTimestamp)?.volume;
    if (!dailyVolume) throw new Error(`Daily volume not found for timestamp: ${dayTimestamp}`);

    return {
        dailyVolume,
    };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(v2ChainIDs).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: '2023-12-18',
            },
        }
    }, {}),
}

export default adapter;
