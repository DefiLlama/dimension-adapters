import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addWalletVAsterAmounts, fetchWalletVAsterDay, WALLET_V_ASTER_START } from '../helpers/wallet-v-aster';

async function fetch(options: FetchOptions) {
  const day = await fetchWalletVAsterDay(options.dateString);
  if (day.takerVolumeComplete !== true) {
    throw new Error(`Wallet V Aster: taker volume is incomplete for ${options.dateString}`);
  }

  const dailyVolume = options.createBalances();
  addWalletVAsterAmounts(dailyVolume, day.takerVolumeByQuoteAsset, options.dateString);
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ASTER],
  start: WALLET_V_ASTER_START,
  fetch,
  doublecounted: true,
  methodology: {
    Volume: 'Notional of taker fills attributed to Wallet V on Aster Futures, counted once on the UTC trade date.',
  },
};

export default adapter;
