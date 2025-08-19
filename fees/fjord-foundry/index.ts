import { BreakdownAdapter, FetchOptions } from "../../adapters/types";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const feeEndpoint = "https://fjord-api.vercel.app/api/daily-stats?version=2";
const feeEndpointV1 = "https://fjord-api.vercel.app/api/daily-stats?version=1";

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
    const historicalFees = (await fetchURL(feeEndpoint))

    const chainData = [...historicalFees.stats.evm, ...historicalFees.stats.svm].find(cd => cd.chainId === chainId);

    const dailyFee = chainData.stats
        .find((dayItem: any) => dayItem.timestamp === dayTimestamp)?.fees

    return {
        dailyFees: dailyFee,
        dailyRevenue: dailyFee,
    };
};

const getV1Data = async (endTimestamp: number, chainId: number) => {
    const dayTimestamp = getTimestampAtStartOfDayUTC(endTimestamp)
    const historicalFees = (await fetchURL(feeEndpointV1))

    const chainData = historicalFees.stats.find((cd: any) => cd.chainId === chainId);

    const dailyFee = chainData.stats
        .find((dayItem: any) => dayItem.timestamp === dayTimestamp)?.fees

    return {
        dailyFees: dailyFee,
        dailyRevenue: dailyFee,
    };
};

const methodology = {
    Fees: "Fees collected from user trading fees",
    Revenue: "Revenue is 100% fee of each swap which goes to treasury",
};

const adapter: BreakdownAdapter = {
    version: 2,
    methodology,
    breakdown: {
        v2: Object.keys(v2ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async ({ startOfDay }: FetchOptions) => await getV2Data(startOfDay, v2ChainIDs[chain]),
                    start: '2023-12-18',
                },
            }
        }, {}),
        v1: Object.keys(v1ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async ({ startOfDay }: FetchOptions) => await getV1Data(startOfDay, v1ChainIDs[chain]),
                    start: '2021-09-17',
                },
            }
        }, {}),
    }
}

export default adapter;
