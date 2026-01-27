import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url = 'https://api.rainbow.ag/analytics/volumes';

interface IAPIResponse {
    dailyVolume: string;
}

const fetch: Fetch = async (timestamp: number) => {
    const { dailyVolume }: IAPIResponse = await fetchURL(`${url}?timestamp=${timestamp * 1000}`);

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
