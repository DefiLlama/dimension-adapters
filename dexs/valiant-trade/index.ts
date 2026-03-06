import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';

const CONFIG: Record<string, { url: string, start: string }> = {
  [CHAIN.FOGO]: {
    url: 'https://mainnet-pro-api.valiant.trade/dex/analytics/swapStat',
    start: '2025-12-20',
  },
}

async function fetch(_a: number, _b: any, options: FetchOptions) {
  const baseUrl = CONFIG[options.chain].url;
  const url = `${baseUrl}?start=${options.fromTimestamp}&end=${options.toTimestamp}`;
  const data = await httpGet(url);

  return {
    dailyVolume: data.totalSwapVolume,
    dailyFees: data.totalFees,
    dailyUserFees: data.totalFees,
    dailyRevenue: data.totalProtocolFees,
    dailyProtocolRevenue: data.totalProtocolFees,
    dailySupplySideRevenue: data.totalFees - data.totalProtocolFees,
  }
}

const methodology = {
  Fees: "All fees paid by users",
  Revenue: "Revenue going to protocol treasury",
  ProtocolRevenue: "Revenue going to protocol treasury",
  SupplySideRevenue: "Revenue earned by LPs",
}

export default {
  version: 1,
  fetch,
  chains: [CHAIN.FOGO],
  start: '2025-12-20',
  // runAtCurrTime: true,
  methodology,
}
