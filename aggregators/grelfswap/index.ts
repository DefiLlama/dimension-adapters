import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchUrl from "../../utils/fetchURL";

const fetch = async (_t: any, _b: any, options: FetchOptions) => {
    const response = await fetchUrl(`https://grelfswap.com/api/defillama/volume?startTimestamp=${options.startTimestamp}`);

    if (!response || response.dailyVolumeUsd === undefined) {
        throw new Error('No data found');
    }

    return {
        dailyVolume: response.dailyVolumeUsd,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    chains: [CHAIN.HEDERA],
    fetch,
    start: '2025-11-07',
};

export default adapter;
