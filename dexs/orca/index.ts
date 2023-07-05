import axios from 'axios';
import { CHAIN } from '../../helpers/chains';

const wpEndpoint = "https://api.mainnet.orca.so/v1/whirlpool/list?whitelisted=true";

async function fetch() {
    const [whirlpools] = await Promise.all([axios.get(wpEndpoint)]);
    const wpVol = whirlpools.data.whirlpools.reduce((sum: number, pool: any) =>
        sum + (pool?.volume?.day || 0)
        , 0);
    return {
        dailyVolume: wpVol,
        timestamp: Date.now() / 1e3
    }
}

export default {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            runAtCurrTime: true,
            start: async () => 0,
        }
    }
}
