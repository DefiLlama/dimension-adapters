import { FetchOptions } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const volumeURL = 'https://api.stabble.org/stats/volume';

async function fetch(options: FetchOptions) {
    const url = `${volumeURL}?startTimestamp=${options.startTimestamp}&endTimestamp=${options.endTimestamp}`;
    const dailyVolume = await httpGet(url);

    return {
        dailyVolume: dailyVolume,
        timestamp: options,
    }
}

export default {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            start: 1717563162,
        }
    }
}
