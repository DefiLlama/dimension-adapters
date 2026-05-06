import { CHAIN } from '../helpers/chains';
import fetchURL from '../utils/fetchURL';
import { sleep } from '../utils/utils';
import { FetchOptions, SimpleAdapter } from "../adapters/types";

const meteoraStatsEndpoint = 'https://dlmm.datapi.meteora.ag/pools';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  let page = 1;
  const limit = 100;

  while (true) {
    const response = await fetchURL(`${meteoraStatsEndpoint}?page=${page}&limit=${limit}`);
    const pools = response.data || [];
    if (pools.length === 0) break;

    for (const pool of pools) {
      const tvl = pool.tvl || 0;
      const volume = pool.volume?.['24h'] ? Number(pool.volume['24h']) : 0;
      const fees = pool.fees?.['24h'] ? Number(pool.fees['24h']) : 0;
      const protocol_fees = pool.protocol_fees?.['24h'] ? Number(pool.protocol_fees['24h']) : 0;

      // Same wash trading filter as dexs/meteora-dlmm.ts
      if (pool.is_blacklisted || (tvl < 1_000_000 && volume > tvl * 10)) continue;

      dailyFees.addUSDValue(fees);
      dailyRevenue.addUSDValue(protocol_fees);
      dailySupplySideRevenue.addUSDValue(fees - protocol_fees);
    }

    const lastPool = pools[pools.length - 1];
    if (lastPool.volume?.['24h'] < 1000) break;
    await sleep(100);
    page++;
  }

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      runAtCurrTime: true,
      start: '2023-03-01',
    }
  },
  methodology: {
    Fees: "All swap fees paid by traders in Meteora DLMM pools, excluding wash-traded pools (TVL < $1M and volume > 10x TVL).",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "Fees distributed to LPs after protocol fee deduction.",
  },
  breakdownMethodology: {
    Fees: "Trader-paid swap fees.",
    Revenue: "Protocol fees retained by Meteora.",
    SupplySideRevenue: "LP share after protocol fee deduction.",
  }
};

export default adapter;
