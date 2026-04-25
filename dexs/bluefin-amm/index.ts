import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const fetch = async (_a: any, _b: any, _c: FetchOptions) => {
    const pools = await fetchURL("https://swap.api.sui-prod.bluefin.io/api/v1/pools/info");
    let dailyVolume = 0;
    for (const pool of pools) {
        dailyVolume += Number(pool.day.volume);
    }

    return {
        dailyVolume,
    }
};

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2024-11-19',
            runAtCurrTime: true
        },
    },
};

export default adapter;
