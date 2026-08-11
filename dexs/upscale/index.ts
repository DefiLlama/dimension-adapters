import { CHAIN } from '../../helpers/chains'
import fetchURL from '../../utils/fetchURL'
import { FetchOptions, FetchResult } from "../../adapters/types";
import { SimpleAdapter } from '../../adapters/types';

const INFLATED_VOLUME_THRESHOLD = 500_000_000;

async function fetch(options: FetchOptions): Promise<FetchResult> {
  const response = await fetchURL(`https://api.upscale.trade/stats?timestamp=${options.startOfDay}`)
  const dailyVolume = Number(response.fundedTradingVolumeLastDay);

  if(dailyVolume > INFLATED_VOLUME_THRESHOLD) {
    throw new Error('Volumes are inflated, there is no way to verify')
  }

  return {
    dailyVolume,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: '2025-11-25',
  methodology: {
    Volume: 'Trading volume for funded accounts only (in USD) from UpScale API service.',
  },
}

export default adapter;