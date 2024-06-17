import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const POOLS_API_ENDPOINT = 'https://pools-spn5wgvtfq-uc.a.run.app/';

async function fetch(timestamp: number) {
    const pools = await httpGet(POOLS_API_ENDPOINT);
    const vol24h = pools.reduce((sum: number, pool: any) => sum + (pool?.stats?.volume_24h || 0), 0);
    return {
        dailyVolume: vol24h,
        timestamp: timestamp
    }
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
