import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryHyperliquidOutcomeOpenInterestV2 } from "../helpers/hyperliquid-v2";

// HIP-4 outcome markets: every outstanding Yes/No pair is backed by $1 of USDC collateral and is one contract,
// so open interest is the number of outstanding pairs in USD, counted once.
const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  openInterestAtEnd.addUSDValue(await queryHyperliquidOutcomeOpenInterestV2(options));
  return { openInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 1, // the indexer serves end-of-day snapshots
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2026-05-02',
  methodology: {
    OpenInterest: "Outstanding Yes/No pairs on HIP-4 outcome markets at the end of the day, each backed by $1 of USDC and counted once.",
  },
};

export default adapter;
