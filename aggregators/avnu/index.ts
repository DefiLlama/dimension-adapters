import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://starknet.api.avnu.fi';
const endpoint = '/v1/analytics/volumes/';

interface IAPIResponse {
    date: number;
    dailyVolume: string;
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
    const { dailyVolume }: IAPIResponse = (await fetchURL(`${URL}${endpoint}${timestamp * 1000}`));
    if (Number(dailyVolume) >= 100000000) {
        throw new Error('Daily volume is greater than 100M unusually high');
    }
    return {
        dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.STARKNET]: {
            fetch,
            start: '2023-05-15',
        },
    },
};

export default adapter;
