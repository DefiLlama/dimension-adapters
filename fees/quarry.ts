import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import type { FetchOptions } from "../adapters/types";

// Quarry protocol has not provided any information on whether or not they charge any fees on the yield earned.
// https://exponential.fi/protocols/quarry/151eab48-2870-4a28-af88-6b80cc868d1e

async function fetch(_options: FetchOptions) {
  return {
    dailyFees: 0,
    dailyRevenue: 0
   
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2021-11-19', 
    },
  },
  methodology: {
    Fees: "Quarry protocol has not provided any information on whether or not they charge any fees on the yield earned..",
    Revenue: "Quarry protocol has not provided any information on whether or not they charge any fees on the yield earned.."
  },
};

export default adapter;
