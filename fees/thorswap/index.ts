import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

const graph = (_chain: Chain): any => {
  return async (timestamp: number, _: any, options: FetchOptions): Promise<FetchResultFees> => {
    const dailyFees = await addTokensReceived({
      targets: ['0x546e7b1f4b4Df6CDb19fbDdFF325133EBFE04BA7', '0x6Ee1f539DDf1515eE49B58A5E9ae84C2E7643490', '0x6d1eff1aFF1dc9978d851D09d9d15f2938Da7BD7'], // v3, v4, v5 fee collectors
      tokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'], 
      options
    })
    const dailyRevenue = dailyFees.clone();
    const dailyProtocolRevenue = dailyRevenue.clone(0.25); // 25% of revenue goes to protocol
    const dailyHoldersRevenue = dailyRevenue.clone(0.75); // 75% of revenue goes to holders
    return { dailyFees, dailyRevenue: dailyRevenue, dailyProtocolRevenue: dailyProtocolRevenue, dailyHoldersRevenue: dailyHoldersRevenue, timestamp }
  }
}


const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: graph(CHAIN.ETHEREUM),
      start: '2025-02-19',
    },
  },
  methodology: {
    Fees: 'Swap fees paid by users.',
    Revenue: 'Swap fees paid by users.',
    ProtocolRevenue: '25% of revenue goes to protocol treasury.',
    HoldersRevenue: '75% of revenue goes to THOR holders. 20% goes to buy THOR from market and burn. Rest is going to stakers. Stakers can choose in which token they want to receive their rewards either THOR or USDC.',
  }
}

export default adapter;
