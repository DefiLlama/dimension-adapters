import { FetchOptions } from '../adapters/types';
import { CHAIN } from '../helpers/chains'
import { httpGet } from '../utils/fetchURL';

const methodology = {
  Fees: "There are multiple fee tiers per pool (e.g., 0.01% / 0.05% / 0.30% / 1.00%) paid by users on every trades.",
  UserFees: "Users pay fees on every trades.",
  Revenue: 'Protocol gets 32% of the swap fees.',
  ProtocolRevenue: 'Protocol gets 32% of the swap fees.',
  SupplySideRevenue: 'There are 68% fees distributed to LPs.',
};

async function fetch(_a: any, _b: any, _: FetchOptions) {
  let dailyVolume = 0
  let dailyFees = 0

  const pools: any = await httpGet('https://v3.potatoswap.finance/api/pool/list-all')
  
  for (const pool of pools.data) {
    dailyVolume += Number(pool.volume_24h_usd)
    dailyFees += Number(pool.fee_24h_usd)
  }
  
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees * 0.32,
    dailyProtocolRevenue: dailyFees * 0.32,
    dailySupplySideRevenue: dailyFees * 0.68,
  }
}

export default {
  version: 1,
  methodology,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch: fetch,
      runAtCurrTime: true,
    },
  },
}
