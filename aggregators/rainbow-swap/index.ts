import {Fetch, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const URL = 'https://api.blackbot.technology';
const endpoint = '/rainbow/analytics/volumes';
const start = 1720645200;// 11.07.2024

interface IAPIResponse {
    dailyVolume: string;
    totalVolume: string;
}

const fetch: Fetch = async (timestamp) => {
    const {dailyVolume, totalVolume}: IAPIResponse = await fetchURL(`${URL}${endpoint}?timestamp=${timestamp * 1000}`);

    return {
        timestamp,
        dailyVolume,
        totalVolume
    };
};

const adapters: SimpleAdapter = {
    adapter: {
        [CHAIN.TON]: {
            start,
            fetch
        }
    }
}
export default adapters
