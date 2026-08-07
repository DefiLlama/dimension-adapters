import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';

const meteoraStatsEndpoint = 'https://dlmm.datapi.meteora.ag/pools';

// Meteora DLMM caps total swap fee (LP + protocol share) at 10% on-chain; 0.105 gives headroom so pools sitting exactly at the cap aren't dropped by rounding.
const MAX_FEE_RATE = 0.105;

async function fetch() {
  let page = 1;
  let dailyVolume = 0;
  let dailyFees = 0;
  let dailyRevenue = 0;
  let dailySupplySideRevenue = 0;
  const limit = 100;

  while (true) {
    const response = await fetchURL(`${meteoraStatsEndpoint}?page=${page}&limit=${limit}`);

    const pools = response.data;
    if (!Array.isArray(pools)) throw new Error('meteora-dlmm: malformed response, expected `data` array');
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = pool.tvl;
      // `fees` is the LP share only, net of the protocol cut — `fees + protocol_fees`
      // is what the trader paid
      const volume = pool.volume['24h'];
      const lpFees = pool.fees['24h'];
      const protocolFees = pool.protocol_fees['24h'];

      if (![tvl, volume, lpFees, protocolFees].every((v: any) => typeof v === 'number' && Number.isFinite(v))) {
        throw new Error(`meteora-dlmm: malformed pool stats for pool ${pool.address}`);
      }

      const fees = lpFees + protocolFees;

      // Ignore if TVL < 1M and volume > 10x TVL.
      if (pool.is_blacklisted || (tvl < 1_000_000 && volume > tvl * 10) || fees > volume * MAX_FEE_RATE)
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
  Fees: 'Total swap fees paid by traders — each pool\'s LP fee share plus its protocol fee share.',
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
