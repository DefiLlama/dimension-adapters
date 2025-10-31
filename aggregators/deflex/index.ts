import fetchURL from "../../utils/fetchURL"
import type { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://api.deflex.fi/api/volumeStats"

interface IAPIResponse {
    volume: any;
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const response: IAPIResponse[] = (await fetchURL(URL)).last_24h;
    return {
        dailyVolume: `${response.reduce((prev: number, current: any) => current.volume + prev, 0)}`,
    };
};

const adapter: SimpleAdapter = {
    deadFrom: '2024-01-01',
    adapter: {
        [CHAIN.ALGORAND]: {
            fetch,
            runAtCurrTime: true,
        },
    }
};

export default adapter;
