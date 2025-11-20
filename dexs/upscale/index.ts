import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { FetchResult } from "../../adapters/types";
import { SimpleAdapter } from '../../adapters/types';

const adapterData = {
  runAtCurrTime: true,
  fetch: async (timestamp: number): Promise<FetchResult> => {
      const response = await fetchURL(`https://api.upscale.trade/stats?timestamp=${timestamp}`)

      if (!response) {
          throw new Error('Error during API call')
      }

      return {
          dailyVolume: Number(response.fundedTradingVolumeLastDay),
          timestamp: timestamp,
      }
  },
}

const adapter: SimpleAdapter = {
    methodology: {
        TotalVolume: 'Trading volume for funded accounts only (in USD)',
        DataSource: 'Public API provided by upscale'
    },
    adapter: {
        [CHAIN.BSC]: adapterData,
        [CHAIN.BASE]: adapterData,
        // ['0g']: adapterData, TODO: add 0g
    },
}

export default adapter;