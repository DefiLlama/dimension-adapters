import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const volumeEndpoint = "https://mfx-stats-mainnet.fly.dev/volume";

async function fetch(_options: FetchOptions) {
  const response = await httpGet(volumeEndpoint);

  return {
    dailyVolume: response.dailyVolume['solana:' + ADDRESSES.solana.USDC],}
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  runAtCurrTime: true,
}

export default adapter;
