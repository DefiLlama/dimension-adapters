import axios from 'axios';
import { CHAIN } from '../../helpers/chains';

const wpEndpoint = "https://api.mainnet.orca.so/v1/whirlpool/list?whitelisted=true";

async function fetch(timestamp: number) {
    const [whirlpools] = await Promise.all([axios.get(wpEndpoint)]);
    const wpVol = whirlpools.data.whirlpools.reduce((sum: number, pool: any) =>
        sum + (pool?.volume?.day || 0)
        , 0);
    return {
        dailyVolume: wpVol,
        timestamp: timestamp
    }
}

export default {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            runAtCurrTime: true,
            start: 1663113600,
        }
    }
}
