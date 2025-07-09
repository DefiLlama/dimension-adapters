import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

async function fetchSUI({ startTimestamp, endTimestamp }: FetchOptions) {
    const dailyVolume = (await fetchURL(`https://app.fullsail.finance/api/defi_llama/volume?start_timestamp=${startTimestamp*1000}&end_timestamp=${endTimestamp*1000}`)).volume_usd;
    return {
        dailyVolume: dailyVolume,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchSUI,
            start: '2025-05-30',
        }
    }
};

export default adapter;