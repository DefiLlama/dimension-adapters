import { FetchOptions, BreakdownAdapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const volumeResponse = await httpGet(`https://spo-server.optim.finance/oada/stake-auction-volume?timeframe=1d&time=${options.endTimestamp}`);

  if (volumeResponse.tag !== 'OK') throw new Error('Failed to fetch volume data')

  return {
    dailyVolume: volumeResponse?.contents['1D']/1e6,
  }
}

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    derivatives: {
      [CHAIN.CARDANO]: {
        fetch: fetchVolume,
        start: 1717200000,
      }
    },
  },
};


export default adapter;
