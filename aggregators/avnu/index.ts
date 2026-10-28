import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://starknet.api.avnu.fi';
const endpoint = '/v1/analytics/volumes/';

interface IAPIResponse {
    date: number;
    dailyVolume: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
    const { dailyVolume }: IAPIResponse = (await fetchURL(`${URL}${endpoint}${options.toTimestamp * 1000}`));
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
