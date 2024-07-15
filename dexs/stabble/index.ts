import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

async function fetch() {
    return httpGet('https://api.stabble.org/stats/volume?type=daily');
}

export default {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            runAtCurrTime: true,
            start: 1717563162,
        }
    }
}
