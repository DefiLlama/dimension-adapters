import fetchURL from "../../utils/fetchURL";
import { FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const BASE_URL = "https://min-api.bitoro.network/btr/stats/global";
const startTimestamp = 1711324800; // 2024-03-25 00:00:00

const constructUrl = (startTime: number, endTime: number): string => {
    return `${BASE_URL}?start=${startTime}&end=${endTime}`;
}

const fetch = async (options: any): Promise<FetchResultV2> => {
    const { fromTimestamp, toTimestamp } = options;
    const dailyVolume = await fetchURL(constructUrl(fromTimestamp, toTimestamp));
    const totalVolume = await fetchURL(constructUrl(startTimestamp, toTimestamp));

    return {
        dailyVolume: dailyVolume.volume || 0,
        totalVolume: totalVolume.volume || 0,
    };
};

export default {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            start: startTimestamp
        },
    },
    version: 2
}