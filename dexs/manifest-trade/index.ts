import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';

const volumeEndpoint = "https://mfx-stats-mainnet.fly.dev/volume";

async function fetch(timestamp: number) {
  const response = await httpGet(volumeEndpoint);

  return {
    dailyVolume: response.dailyVolume['solana:' + ADDRESSES.solana.USDC],
    timestamp: timestamp
  }
}

export default {
  adapter: {
    [CHAIN.SOLANA]: {
      runAtCurrTime: true,
      fetch: fetch,
    }
  }
}
