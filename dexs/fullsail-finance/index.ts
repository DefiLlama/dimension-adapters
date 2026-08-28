import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = (await fetchURL(`https://app.fullsail.finance/api/defi_llama/volume?start_timestamp=${options.startTimestamp * 1000}&end_timestamp=${options.endTimestamp * 1000}`)).volume_usd;

    return {
        dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch,
            start: '2025-05-30',
        }
    }
};

export default adapter;