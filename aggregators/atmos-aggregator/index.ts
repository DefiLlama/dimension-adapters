import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const API_ENDPOINT = "https://api.atmos.ag/stats/defillama/stats";

const fetch = async (options: FetchOptions) => {
    const response = await httpGet(`${API_ENDPOINT}?timestamp=${options.startOfDay}`);
    const dailyVolume = response.data.aggregator.volume;
    return {
        dailyVolume
    };
};

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUPRA]: {
            fetch,
            start: '2025-09-23',
        },
    },
};

export default adapter;
