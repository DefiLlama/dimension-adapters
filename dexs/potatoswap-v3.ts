import { FetchOptions } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { httpGet } from '../utils/fetchURL';
import BigNumber from 'bignumber.js';

const methodology = {
  Fees: "Total fees paid by users on every swap, determined by the pool's fee tier (e.g., 0.01%, 0.05%, 0.30%, 1.00%).",
  UserFees: "Total fees paid by users (same as Fees).",
  Revenue: "Protocol revenue represents the share of swap fees diverted to the protocol. This share is set on a per-pool basis and can be updated by governance. Default share is 0%.",
  ProtocolRevenue: "Calculated per-pool. If a pool's slot0() returns N > 0 for feeProtocol, the protocol revenue for that pool is (Total Fees / N).",
  SupplySideRevenue: "The portion of swap fees distributed to Liquidity Providers (LPs). This is (Total Fees - Protocol Revenue) for each pool.",
};

// Uniswap V3 standard ABI for slot0. Selector: 0x3850c7bd
const SLOT0_ABI = "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";

async function fetch(_timestamp: number, _chainBlocks: any, options: FetchOptions) {
  // Initialize all accumulators as BigNumber objects
  let dailyVolume = new BigNumber(0);
  let dailyFees = new BigNumber(0);
  let dailyRevenue = new BigNumber(0);

  const poolsResponse: any = await httpGet('https://v3.potatoswap.finance/api/pool/list-all');
  
  if (!poolsResponse.data || poolsResponse.data.length === 0) {
    throw new Error("Failed to fetch pool data");
  }

  const pools = poolsResponse.data;

  const slot0Results = await options.api.multiCall({
    abi: SLOT0_ABI,
    calls: pools.map((p: any) => ({ target: p.address })),
    chain: CHAIN.XLAYER,
    requery: true,
  });

  // 2. Iterate over pools and calculate revenue distribution
  for (let i = 0; i < pools.length; i++) {
    const pool = pools[i];
    
    // Use BigNumber to wrap the high-precision string values
    const poolFees24h = new BigNumber(pool.fee_24h_usd);
    const poolVolume24h = new BigNumber(pool.volume_24h_usd);

    // Use .plus() for accurate addition
    dailyVolume = dailyVolume.plus(poolVolume24h);
    dailyFees = dailyFees.plus(poolFees24h);

    const protocolFeeShare = Number(slot0Results[i].feeProtocol);

    if (protocolFeeShare > 0) {
      // Use .div() and .minus() for accurate calculations
      const poolProtocolRevenue = poolFees24h.div(protocolFeeShare);
      
      dailyRevenue = dailyRevenue.plus(poolProtocolRevenue);
    }
  }
  
  const dailySupplySideRevenue = dailyFees.minus(dailyRevenue)
  
  // Return the final values as strings
  return {
    dailyVolume: dailyVolume.toString(),
    dailyFees: dailyFees.toString(),
    dailyUserFees: dailyFees.toString(),
    dailyRevenue: dailyRevenue.toString(),
    dailyProtocolRevenue: dailyRevenue.toString(),
    dailySupplySideRevenue: dailySupplySideRevenue.toString(),
  };
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
};