import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchHIP3DeployerData } from "../helpers/hyperliquid";

async function fetch(_1: number, _: any,  options: FetchOptions): Promise<FetchResultV2> {
  const result = await fetchHIP3DeployerData({ options, hip3DeployerId: 'flx' });
  
  return {
    openInterestAtEnd: result.currentPerpOpenInterest,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch,
      // start: '2025-11-13',
      runAtCurrTime: true,
    },
  },
  doublecounted: true,
};

export default adapter;
