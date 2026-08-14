import { SimpleAdapter, FetchOptions, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url = 'https://api.rainbow.ag/analytics/volumes';

interface IAPIResponse {
    dailyVolume: string;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
    const { dailyVolume }: IAPIResponse = await fetchURL(`${url}?timestamp=${options.toTimestamp * 1000}`);

    return {
        dailyVolume,
    };
};

const adapters: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.TON]: {
            fetch,
            start: '2024-07-11',
        }
    }
}
export default adapters
