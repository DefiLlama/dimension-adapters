import fetchURL from "../../utils/fetchURL";
import { FetchResult, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://defilama-stats.vooi.workers.dev/";
const endpoint = "";
const startTimestamp = 1714608000; // 02.05.2024


interface IAPIResponse {
    dailyVolume: string;
    totalVolume: string;
}
const fetch = async (options: any): Promise<FetchResultV2> => {
    let timestamp = options.toTimestamp
    const { dailyVolume, totalVolume }: IAPIResponse = (
        (await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)).data
    );
    return {
        dailyVolume,
        totalVolume,
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
