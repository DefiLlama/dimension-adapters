import { CHAIN } from '../helpers/chains';
import { httpGet } from '../utils/fetchURL';


const endpoint = "https://asia-southeast1-ktx-finance-2.cloudfunctions.net/sailor_poolapi/getPoolList";

const fetch = async () => {
  const blacklistedPools = new Set(['0x6d8cefb90d3caaaa7cc18fb4e2cf81be812287ff'].map(i => i.toLowerCase())); 
  const { poolStats } = await httpGet(endpoint);
  let dailyFees = 0
  let dailyVolume = 0
  for (const pool of poolStats) {
    if (blacklistedPools.has(pool.id.toLowerCase())) continue;
    dailyVolume += pool.day.volume
    dailyFees += pool.day.volume * pool.feeTier/1e6
  }
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees * 0.16,
    dailyProtocolRevenue: dailyFees * 0.16,
    dailySupplySideRevenue: dailyFees * 0.84,
  }
};

const methodology = {
  Fees: "Sailor-Finance protocol swap fee (0.3% per swap).",
  LPProvidersRevenue:
    "Fees distributed to the LP providers (84% of total accumulated fees).",
  ProtocolAccumulation:
    "Fees sent to the protocol wallet (16% of total accumulated fees), is used to provide benefits to users in custom ways.",
};


export default {
  version: 1,
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      runAtCurrTime: true,
      meta: {
        methodology,
      },
    }
  }
}
