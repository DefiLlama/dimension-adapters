import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';

const meteoraStatsEndpoint = 'https://dlmm.datapi.meteora.ag/pools';

async function fetch() {
  let page = 1;
  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyRevenue = 0;
  let dailySupplySideRevenue = 0;
  const limit = 100;

  while (true) {
    const response = await fetchURL(`${meteoraStatsEndpoint}?page=${page}&limit=${limit}`);

    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = pool.tvl || 0;
      const volume = Number(pool.volume['24h'] || 0);
      // `fees` is the LP share only, net of the protocol cut — `fees + protocol_fees`
      // is what the trader paid
      const lpFees = Number(pool.fees['24h'] || 0);
      const protocolFees = Number(pool.protocol_fees['24h'] || 0);
      const fees = lpFees + protocolFees;

      // Ignore if TVL < 1M and volume > 10x TVL.
      if (pool.is_blacklisted || (tvl < 1_000_000 && volume > tvl * 10) || fees > volume * 0.105)
        continue;

      dailyVolume += volume;
      dailyFees += fees;
      dailyRevenue += protocolFees;
      dailySupplySideRevenue += lpFees;
    }

    const lastPool = pools[pools.length - 1];
    if (lastPool.volume['24h'] < 1000) break;

    await sleep(100)

    page++;
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Total swap volume across all Meteora DLMM pools.',
  Fees: 'Swap fees paid by traders — each pool\'s base fee plus any dynamic fee, applied to its volume.',
  Revenue: 'Meteora\'s cut of the swap fees, taken per pool and sent to the treasury.',
  ProtocolRevenue: 'Meteora\'s cut of the swap fees, taken per pool and sent to the treasury.',
  SupplySideRevenue: 'The remainder of the swap fees, paid to liquidity providers.',
}

export default {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-11-07'
    }
  }
}
