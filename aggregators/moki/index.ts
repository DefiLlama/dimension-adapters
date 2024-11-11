import {Fetch, SimpleAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const URL = 'https://api.leapwallet.io/';
const endpoint = 'ton-sor/api/v1/analytics/volumes';
const start = 1727711103;// 30.09.2024

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
