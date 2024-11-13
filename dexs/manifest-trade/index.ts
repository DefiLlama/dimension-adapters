import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const volumeEndpoint = "https://mfx-stats-mainnet.fly.dev/volume";

async function fetch(timestamp: number) {
    const response = await httpGet(volumeEndpoint);

    return {
        totalVolume: response.totalVolume['solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
        dailyVolume: response.dailyVolume['solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'],
        timestamp: timestamp
    }
}

export default {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
        }
    }
}
