import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const wpEndpoint = "https://api.mainnet.orca.so/v1/whirlpool/list";

async function fetch(timestamp: number) {
    const [whirlpools] = await Promise.all([httpGet(wpEndpoint)]);
    const wpVol = whirlpools.whirlpools.reduce((sum: number, pool: any) =>
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
