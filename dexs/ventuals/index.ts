import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchHIP3DeployerData } from "../../helpers/hyperliquid";

async function fetch(_1: number, _: any,  options: FetchOptions): Promise<FetchResultV2> {
  const result = await fetchHIP3DeployerData({ options, hip3DeployerId: 'vntl' });
  
  return {
    dailyVolume: result.dailyPerpVolume,
    dailyFees: result.dailyPerpFee,
    dailyRevenue: result.dailyPerpFee,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      start: '2025-11-13',
    },
  },
  doublecounted: true,
  methodology: {
    Fees: 'Trading fees paid by users on Hyperliquid markets deployed by Ventuals.',
    Revenue: 'Trading fees paid by users on Hyperliquid markets deployed by Ventuals.',
  }
};

export default adapter;
