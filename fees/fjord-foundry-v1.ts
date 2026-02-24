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

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    adapter: Object.keys(v1ChainIDs).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: async ({ startOfDay }: FetchOptions) => await getV1Data(startOfDay, v1ChainIDs[chain]),
                start: '2021-09-17',
            },
        }
    }, {}),
}

export default adapter;
