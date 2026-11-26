import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { addWalletVAsterAmounts, fetchWalletVAsterDay, WALLET_V_ASTER_START } from '../helpers/wallet-v-aster';

async function fetch(options: FetchOptions) {
  const day = await fetchWalletVAsterDay(options.dateString);
  if (day.volumeComplete !== true || !Number.isSafeInteger(day.commissionTradeCount) ||
      day.commissionTradeCount < 0 || day.visibleTradeCount !== day.commissionTradeCount) {
    throw new Error(`Wallet V Aster: visible Builder fills are incomplete for ${options.dateString}`);
  }

  const dailyVolume = options.createBalances();
  addWalletVAsterAmounts(dailyVolume, day.visibleVolumeByQuoteAsset, options.dateString);
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ASTER],
  start: WALLET_V_ASTER_START,
  fetch,
  doublecounted: true,
  methodology: {
    Volume: "Notional of user fills attributed to Wallet V's Futures Builder code in Aster userTrades, by UTC trade date. The source reports Builder-tagged user fills and does not separate maker and taker totals. Volume requires complete visible coverage against userCommissions.",
  },
};

export default adapter;
