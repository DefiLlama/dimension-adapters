import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({
    options,
    targets: ['Bk2qhUpf3hHZWwpYSudZkbrkA9DVKrNNhQfnH7zF67Ji']
  });

  return { dailyFees, dailyRevenue: dailyFees }
}

const meta = {
  methodology: {
    Fees: 'Includes 0.1% fee for delayed unstaking, 5% fee on staking rewards and a 0.1% fee applies when burning LST tokens created through the LST Creator program.',
    Revenue: 'All fees collected by the protocol',
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2024-05-02",
      meta
    }
  }
};