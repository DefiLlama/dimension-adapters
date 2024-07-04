import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const feeEndpoint = "https://fjord-api.vercel.app/api/daily-stats?version=2";
const feeEndpointV1 = "https://fjord-api.vercel.app/api/daily-stats?version=1";

const v2ChainIDs = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
    [CHAIN.AVAX]: 43114,
    [CHAIN.BASE]: 8453,
    [CHAIN.BLAST]: 81457,
    [CHAIN.BSC]: 56,
};

const v1ChainIDs = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
};

const getV2Data = async (endTimestamp: number, chainId: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpoint))

    const chainData = historicalVolume.stats.find(cd => cd.chainId === chainId);

    const totalVolume = chainData.stats
        .filter(item => item.timestamp <= dayTimestamp)
        .reduce((acc, { volume }) => acc + volume, 0)

    const dailyVolume = chainData.stats
        .find(dayItem => dayItem.timestamp === dayTimestamp)?.volume

    return {
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : '0',
    };
};

const getV1Data = async (endTimestamp: number, chainId: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpointV1))

    const chainData = historicalVolume.stats.find(cd => cd.chainId === chainId);

    const totalVolume = chainData.stats
        .filter(item => item.timestamp <= dayTimestamp)
        .reduce((acc, { volume }) => acc + volume, 0)

    const dailyVolume = chainData.stats
        .find(dayItem => dayItem.timestamp === dayTimestamp)?.volume

    return {
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : '0',
    };
};

const adapter: BreakdownAdapter = {
    breakdown: {
        v2: Object.keys(v2ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async (_ts: number, _chain: any, { startOfDay }: FetchOptions) => await getV2Data(startOfDay, v2ChainIDs[chain]),
                    start: 1702857600,
                },
            }
        }, {}),
        v1: Object.keys(v1ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async (_ts: number, _chain: any, { startOfDay }: FetchOptions) => await getV1Data(startOfDay, v1ChainIDs[chain]),
                    start: 1631836800,
                },
            }
        }, {}),
    }
}

export default adapter;
