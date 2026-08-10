import { CHAIN } from '../../helpers/chains';
import { httpGet } from '../../utils/fetchURL';
import { FetchOptions } from '../../adapters/types';
import { sleep } from '../../utils/utils';

const meteoraStatsEndpoint = 'https://damm-api.meteora.ag/pools/search';

interface Pool {
  total_count: number
  data: Array<{
    trading_volume: number
    fee_volume: number
    pool_type: string
  }>
}

// Protocol fee is 20% of the swap fee on volatile pools and 0% on stable pools
// (on-chain PoolFees.protocol_trade_fee, verified across all live pools). The rest goes to LPs.
const protocolFeeRatio = (poolType: string) => poolType === 'stable' ? 0 : 0.2;

async function fetch(_options: FetchOptions) {
  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyProtocolRevenue = 0;
  let dailySupplySideRevenue = 0;

  let page = 0;
  const limit = 300;
  while (true) {
    const response: Pool = (await httpGet(`${meteoraStatsEndpoint}?page=${page}&size=${limit}&hide_low_tvl=10000`));

    const pools = response.data;
    if (pools.length === 0) break;
    for (const pool of pools) {
      const protocolRatio = protocolFeeRatio(pool.pool_type)
      dailyVolume += pool.trading_volume
      dailyFees += pool.fee_volume
      dailyProtocolRevenue += pool.fee_volume * protocolRatio
      dailySupplySideRevenue += pool.fee_volume * (1 - protocolRatio)
    }

    if (isNaN(dailyVolume) || isNaN(dailyFees)) throw new Error('Invalid daily volume')

    await sleep(100)

    page += 1;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Total spot swap volume across all Meteora DAMM v1 pools.",
  Fees: "Swap fees paid by traders — each pool's trade fee applied to its volume.",
  Revenue: "Meteora's cut of swap fees: 20% on volatile pools and 0% on stable pools, sent to the treasury.",
  ProtocolRevenue: "Meteora's cut of swap fees: 20% on volatile pools and 0% on stable pools, sent to the treasury.",
  SupplySideRevenue: "Swap fees paid to liquidity providers: 80% on volatile pools and 100% on stable pools.",
}

export default {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-30', // Apr 30 2024 - 00:00:00 UTC
    }
  }
}
