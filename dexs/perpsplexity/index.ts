import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { poolTrades, START } from "../../helpers/perpsplexity";

// Pool package lines and ids live in helpers/perpsplexity.ts (one list shared with the fees adapter).
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const t of await poolTrades(options)) dailyVolume.add(t.quote, t.volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  // events come from Sui GraphQL in the [startTimestamp, endTimestamp) window, so hourly pulls work
  pullHourly: true,
  fetch,
  chains: [CHAIN.SUI],
  start: START,
  methodology: {
    Volume: "Buys and sells of Perpsplexity pool tokens, valued in the quote coin each pool trades in (USDC for leveraged pools): what the buyer paid including the fee, or what the seller received before the fee. Excludes leveraged token mints and redemptions (deposits into and withdrawals from a token, not trades between users) and the pools' own hedging trades on Aftermath Perps, which Aftermath counts.",
  },
};

export default adapter;
