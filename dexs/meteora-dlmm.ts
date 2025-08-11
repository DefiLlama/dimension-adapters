import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';

const meteoraStatsEndpoint = 'https://dlmm-api.meteora.ag/info/protocol_metrics';

async function fetch() {
  const i = await fetchURL(meteoraStatsEndpoint)
  return {
    dailyVolume: i.daily_trade_volume,
    dailyFees: i.daily_fee,
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-11-07'
    }
  }
}
