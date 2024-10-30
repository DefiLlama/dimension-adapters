import { FetchOptions, BreakdownAdapter, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchVolume: FetchV2 = async (options: FetchOptions) => {
  const volumeResponse = await fetch(`https://spo-server.optim.finance/oada/stake-auction-volume?timeframe=1d&time=${options.endTimestamp}`).then(response => response.json())

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
