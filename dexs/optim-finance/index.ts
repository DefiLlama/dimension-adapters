import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const volumeResponse = await httpGet(`https://spo-server.optim.finance/oada/stake-auction-volume?timeframe=1d&time=${options.endTimestamp}`);

  if (volumeResponse.tag !== 'OK') throw new Error('Failed to fetch volume data')

  return {
    dailyVolume: volumeResponse?.contents['1D'] / 1e6,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch: fetchVolume,
      start: '2024-06-01',
    }
  },
};


export default adapter;
