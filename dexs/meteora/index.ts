import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';
import { sleep } from '../../utils/utils';

const meteoraStatsEndpoint = 'https://damm-api.meteora.ag/pools/search';
const protocolFeeRatio = 0.2; // source: https://docs.meteora.ag/user-guide/guides/how-to-use-damm-v2#protocol-fee

interface Pool {
  total_count: number
  data: Array<{
    trading_volume: number
    fee_volume: number
  }>
}

async function fetch(_options: FetchOptions) {
  let dailyVolume = 0;
  let dailyFees = 0;

  let page = 0;
  const limit = 300;
  while (true) {
    const response: Pool = (await httpGet(`${meteoraStatsEndpoint}?page=${page}&size=${limit}&hide_low_tvl=10000`));

    const pools = response.data;
    if (pools.length === 0) break;
    for (const pool of pools) {
      dailyVolume += pool.trading_volume
      dailyFees += pool.fee_volume
    }

    if (isNaN(dailyVolume) || isNaN(dailyFees)) throw new Error('Invalid daily volume')

    await sleep(100)

    page += 1;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees * protocolFeeRatio,
    dailyProtocolRevenue: dailyFees * protocolFeeRatio,
    dailySupplySideRevenue: dailyFees * (1 - protocolFeeRatio),
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-30', // Apr 30 2024 - 00:00:00 UTC
    }
  }
}
