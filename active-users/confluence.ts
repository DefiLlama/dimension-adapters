import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { CONFLUENCE_CHAINS, CONFLUENCE_START, ConfluenceDay, confluenceChainDay, fetchConfluenceDay } from "../helpers/confluence";

const fetch = async (options: FetchOptions) => {
  // A wallet active on several chains counts once in the total and once per chain.
  if (options.chain === CHAIN.CHAIN_GLOBAL) {
    const day: ConfluenceDay = options.preFetchedResults;
    return { dailyActiveUsers: day.activeWallets, dailyTransactionsCount: day.transactions };
  }
  const c = confluenceChainDay(options);
  return { dailyActiveUsers: c?.activeWallets ?? 0, dailyTransactionsCount: c?.transactions ?? 0 };
};

const methodology = {
  ActiveUsers:
    "Wallets that completed at least one action through Confluence on the chain during the UTC day: a CCTP bridge (by source chain), a swap, an Arc to Arc payment or a Relay route. Only actions proven on-chain count. A wallet active on several chains counts once in the total and once in each chain's breakdown.",
  Transactions: "Completed Confluence actions (bridges, swaps, Arc payments and Relay routes) during the UTC day.",
};

const adapter: SimpleAdapter = {
  version: 1,
  prefetch: fetchConfluenceDay,
  fetch,
  chains: [...Object.values(CONFLUENCE_CHAINS), CHAIN.CHAIN_GLOBAL],
  start: CONFLUENCE_START,
  methodology,
};

export default adapter;
