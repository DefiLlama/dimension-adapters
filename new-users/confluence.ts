import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { CONFLUENCE_CHAINS, CONFLUENCE_START, ConfluenceDay, confluenceChainDay, fetchConfluenceDay } from "../helpers/confluence";

const fetch = async (options: FetchOptions) => {
  if (options.chain === CHAIN.CHAIN_GLOBAL) {
    const day: ConfluenceDay = options.preFetchedResults;
    return { dailyNewUsers: day.newWallets };
  }
  return { dailyNewUsers: confluenceChainDay(options)?.newWallets ?? 0 };
};

const methodology = {
  NewUsers:
    "Wallets whose first completed Confluence action (CCTP bridge, swap, Arc to Arc payment or Relay route, proven on-chain) happened during the UTC day, on any chain. Per chain: new wallets that were active on that chain that day.",
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
