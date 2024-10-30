import BigNumber from "bignumber.js";
import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchVolume: any = async (options: FetchOptions) => {
  const volumeResponse = await fetch(`https://spo-server.optim.finance/oada/stake-auction-volume?timeframe=1d&time=${options.endTimestamp}`).then(response => response.json())

  if (volumeResponse.tag !== 'OK') return {}

  return {
    dailyVolume: new BigNumber(volumeResponse?.contents['1D']).div(1e6)
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch: fetchVolume,
      start: 1717200000,
    },
  },
};

