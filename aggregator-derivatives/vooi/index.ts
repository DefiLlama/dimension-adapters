import fetchURL from "../../utils/fetchURL";
import { FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://defilama-stats.vooi.workers.dev/";
const endpoint = "";
const startTimestamp = 1714608000; // 02.05.2024


interface IAPIResponse {
    dailyVolume: string;
    totalVolume: string;
}
const fetch = async (timestamp: number): Promise<FetchResult> => {
    const { dailyVolume, totalVolume }: IAPIResponse = (
        (await fetchURL(`${URL}${endpoint}?ts=${timestamp}`)).data
    );
    return {
        timestamp,
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
    // version: 2 // data accepts only one input to timestamp
}
