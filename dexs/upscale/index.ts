import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { FetchOptions, FetchResult } from "../../adapters/types";
import { SimpleAdapter } from '../../adapters/types';

async function fetch(_a: any, b_: any, options: FetchOptions): Promise<FetchResult> {
  const response = await fetchURL(`https://api.upscale.trade/stats?timestamp=${options.startOfDay}`)

  return {
    dailyVolume: Number(response.fundedTradingVolumeLastDay),
  }
}

const adapter: SimpleAdapter = {
  methodology: {
    Volume: 'Trading volume for funded accounts only (in USD) from UpScale API service.',
  },
  adapter: {
    [CHAIN.OFF_CHAIN]: {
      runAtCurrTime: true,
      fetch,
    },
  },
}

export default adapter;