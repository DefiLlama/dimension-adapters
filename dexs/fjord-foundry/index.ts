import { BreakdownAdapter, FetchV2 } from "../../adapters/types";
import { getTimestampAtStartOfPreviousDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const feeEndpoint = "https://fjord-api.vercel.app/api/daily-stats?version=2";

const v2ChainIDs = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.AVAX]: 43114,
    [CHAIN.BASE]: 8453,
    [CHAIN.BLAST]: 81457,
    [CHAIN.BSC]: 56,
};

const getV2Data = async (endTimestamp, chainId) => {
    const dayTimestamp = getTimestampAtStartOfPreviousDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpoint))

    const chainData = historicalVolume.stats.find(cd => cd.chainId === chainId);

    const totalVolume = chainData.stats
        .filter(item => item.timestamp <= dayTimestamp)
        .reduce((acc, { volume }) => acc + volume, 0)

    const dailyVolume = chainData.stats
        .find(dayItem => dayItem.timestamp === dayTimestamp)?.volume

    return {
        timestamp: dayTimestamp,
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    };
};

const adapter: BreakdownAdapter = {
    breakdown: {
        v2: Object.keys(v2ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async (ts: number) => await getV2Data(ts, v2ChainIDs[chain]),
                    start: 1702857600,
                },
            }
        }, {}),
    }
}

export default adapter;
