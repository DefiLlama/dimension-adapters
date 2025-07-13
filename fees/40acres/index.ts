import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json'

const feeCollector = ['0xfF16fd3D147220E6CC002a8e4a1f942ac41DBD23'];

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    tokens: [ADDRESSES[options.chain].USDC],
    targets: feeCollector
  });

  return { dailyFees, dailyRevenue: dailyFees }
}

const meta = {
  methodology: {
    Fees: 'Includes 0.8% fee charged to open a line of credit, 5% of voting rewards that are directed to the protocol treasury and 1% fee on rewards',
    Revenue: 'Amount of fees that go to 40acres treasury.',
  }
}

export default {
  version: 2,
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2025-02-13",
      meta
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2025-03-06",
      meta
    },
    [CHAIN.AVAX]: {
      fetch,
      start: "2025-07-02",
      meta
    }
  }
};