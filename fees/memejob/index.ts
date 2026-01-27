import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTokenDiff } from "../../helpers/token";

const methodology = {
  Revenue: "All revenue is generated from user fees.",
  Fees: "Users pay a 1% fee for each trade. Additionally, approximately 2000 HBAR is charged when a token is migrated.",
};

const FEE_COLLECTOR_CONTRACT = "0x00000000000000000000000000000000000ec550";

async function fetch(options: FetchOptions) {
  const dailyFees  = await getTokenDiff({ target: FEE_COLLECTOR_CONTRACT, options, tokens: [], includeGasToken: true })

  // in case the team moves hbar out of the contract
  dailyFees.removeNegativeBalances()

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.HEDERA]: {
      fetch,
      start: "2024-12-16",
    },
  },
  methodology,
};

export default adapter;
