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
    const historicalFees = (await fetchURL(feeEndpoint))

    const chainData = historicalFees.stats.find(cd => cd.chainId === chainId);

    const totalFee = chainData.stats
        .filter(item => item.timestamp <= dayTimestamp)
        .reduce((acc, { fees }) => acc + fees, 0)

    const dailyFee = chainData.stats
        .find(dayItem => dayItem.timestamp === dayTimestamp)?.fees

    return {
        totalFees: `${totalFee}`,
        dailyFees: dailyFee ? `${dailyFee}` : undefined,
        totalRevenue: `${totalFee}`,
        dailyRevenue: dailyFee ? `${dailyFee}` : undefined,
    };
};

const methodology = {
    Fees: "Fees collected from user trading fees",
    Revenue: "Revenue is 100% fee of each swap which goes to treasury",
};

const adapter: BreakdownAdapter = {
    breakdown: {
        v2: Object.keys(v2ChainIDs).reduce((acc, chain) => {
            return {
                ...acc,
                [chain]: {
                    fetch: async (ts: number) => await getV2Data(ts, v2ChainIDs[chain]),
                    start: 1702857600,
                    meta: {
                        methodology,
                    },
                },
            }
        }, {}),
    }
}

export default adapter;
