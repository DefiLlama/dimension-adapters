import { FetchOptions } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { httpGet } from '../utils/fetchURL';
import BigNumber from 'bignumber.js';

const methodology = {
  Fees: "Total fees paid by users on every swap, determined by the pool's fee tier (e.g., 0.01%, 0.05%, 0.30%, 1.00%).",
  UserFees: "Total fees paid by users (same as Fees).",
  Revenue: "Protocol revenue represents the share of swap fees diverted to the protocol. This share is set on a per-pool basis and can be updated by governance. Default share is 0%.",
  ProtocolRevenue: "Calculated per-pool. feeProtocol is a uint8 containing two uint4 values: feeProtocol0 (lower 4 bits) and feeProtocol1 (upper 4 bits). If feeProtocol0 = x1 and feeProtocol1 = x2, protocol revenue = Total Fees * (1/x1 + 1/x2) / 2. If only one is set, protocol revenue = Total Fees * 1/x.",
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

    // Extract feeProtocol0 (lower 4 bits) and feeProtocol1 (upper 4 bits)
    const feeProtocolValue = Number(slot0Results[i].feeProtocol);
    const feeProtocol0 = feeProtocolValue & 0x0F;
    const feeProtocol1 = (feeProtocolValue >> 4) & 0x0F;
    
    // For combined USD fees, we use the average of (1/feeProtocol0 + 1/feeProtocol1) / 2
    let protocolRevenueRatio = new BigNumber(0);
    
    if (feeProtocol0 > 0 && feeProtocol1 > 0) {
      // Both tokens have protocol fee: average of (1/x1 + 1/x2) / 2
      const ratio0 = new BigNumber(1).div(feeProtocol0);
      const ratio1 = new BigNumber(1).div(feeProtocol1);
      protocolRevenueRatio = ratio0.plus(ratio1).div(2);
    } else if (feeProtocol0 > 0) {
      // Only token0 has protocol fee
      protocolRevenueRatio = new BigNumber(1).div(feeProtocol0);
    } else if (feeProtocol1 > 0) {
      // Only token1 has protocol fee
      protocolRevenueRatio = new BigNumber(1).div(feeProtocol1);
    }
    
    if (protocolRevenueRatio.gt(0)) {
      // Protocol revenue = Total Fees * protocolRevenueRatio
      const poolProtocolRevenue = poolFees24h.times(protocolRevenueRatio);
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