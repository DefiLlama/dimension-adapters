import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const wpEndpoint = "https://api.mainnet.orca.so/v1/whirlpool/list";

async function fetch(timestamp: number) {
    const [whirlpools] = await Promise.all([httpGet(wpEndpoint)]);
    const wpVol = whirlpools.whirlpools
        .filter((pool: any) => pool?.tvl > 100_000)
        .filter((pool: any) => pool?.volume?.day < 1_000_000_000)
        .reduce((sum: number, pool: any) =>
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
