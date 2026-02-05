import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const feeEndpointV1 = "https://fjord-api.vercel.app/api/daily-stats?version=1";
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

const v1ChainIDs: any = {
    [CHAIN.ETHEREUM]: 1,
    [CHAIN.POLYGON]: 137,
    [CHAIN.ARBITRUM]: 42161,
};

const getV2Data = async (endTimestamp: number, chainId: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpointV2))

    const chainData = historicalVolume.stats.evm.find((cd: any) => cd.chainId === chainId);

    const dailyVolume = chainData.stats
        .find((dayItem: any) => dayItem.timestamp === dayTimestamp)?.volume

    return {
        dailyVolume: dailyVolume,
    };
};

const getV1Data = async (endTimestamp: number, chainId: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalVolume = (await fetchURL(feeEndpointV1))

    const chainData = historicalVolume.stats.find((cd: any) => cd.chainId === chainId);

    const dailyVolume = chainData.stats
        .find((dayItem: any) => dayItem.timestamp === dayTimestamp)?.volume

    return {
        dailyVolume: dailyVolume,
    };
};

const adapter: BreakdownAdapter = {
    breakdown: {
        v2: Object.keys(v2ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async (_ts: number, _chain: any, { startOfDay }: FetchOptions) => await getV2Data(startOfDay, v2ChainIDs[chain]),
                    start: '2023-12-18',
                },
            }
        }, {}),
        v1: Object.keys(v1ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async (_ts: number, _chain: any, { startOfDay }: FetchOptions) => await getV1Data(startOfDay, v1ChainIDs[chain]),
                    start: '2021-09-17',
                },
            }
        }, {}),
    }
}

export default adapter;
