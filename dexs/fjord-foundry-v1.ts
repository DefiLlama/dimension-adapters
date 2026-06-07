import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";

const feeEndpointV1 = "https://fjord-api.vercel.app/api/daily-stats?version=1";

const v1ChainIDs: any = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
};

const fetch = async (options: FetchOptions) => {
    const endTimestamp = options.toTimestamp;
    const chainId = v1ChainIDs[options.chain];
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpointV1))

    const chainData = historicalVolume.stats.find((cd: any) => cd.chainId === chainId);

    const dailyVolume = chainData.stats
        .find((dayItem: any) => dayItem.timestamp === dayTimestamp)?.volume
    if (!dailyVolume) throw new Error(`Daily volume not found for timestamp: ${dayTimestamp}`);

    return {
        dailyVolume: dailyVolume,
    };
};

const adapter: SimpleAdapter = {
    adapter: Object.keys(v1ChainIDs).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch,
                start: '2021-09-17',
            },
        }
    }, {}),
}

export default adapter;
