import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const REGISTRY_API = 'https://app.stabble.org/api/registry';

async function fetch(timestamp: number) {
    const registry = await httpGet(REGISTRY_API);
    const vol24h = registry.pools
        .filter((pool: any) => pool.chainId === 101)
        .reduce((sum: number, pool: any) => sum + (pool?.stats?.volume_24h || 0), 0);
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
            // start: 1719579600,
            start: 1717707389,
        }
    }
}