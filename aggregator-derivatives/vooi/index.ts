import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://defilama-stats.vooi.workers.dev/";
const endpoint = "";
const startTimestamp = 1714608000; // 02.05.2024


interface IAPIResponse {
    dailyVolume: string;
    totalVolume: string;
}
const fetch = async (options: any): Promise<FetchResult> => {
    let timestamp = options.toTimestamp
    const { dailyVolume, totalVolume }: IAPIResponse = (
        (await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)).data
    );
    return {
        dailyVolume,
        totalVolume,
        timestamp
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