import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { VOLUME_SQL, withPartition } from "../../helpers/queries/copyfomo";

// copyfomo -- Telegram copy-trading bot (https://www.copyfomo.com, https://x.com/copyfomo).
// Trade volume = the stablecoin leg of every buy and sell executed by a copyfomo wallet.
// See helpers/queries/copyfomo.ts for the on-chain footprint and the classification rule.

const DUNE_TO_CHAIN: Record<string, string> = {
  base: CHAIN.BASE,
  bnb: CHAIN.BSC,
  robinhood: CHAIN.ROBINHOOD,
  solana: CHAIN.SOLANA,
};

const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, withPartition(VOLUME_SQL, options));
};

const fetch = async (options: FetchOptions) => {
  const rows: any[] = options.preFetchedResults || [];
  const dailyVolume = options.createBalances();
  for (const row of rows) {
    if (DUNE_TO_CHAIN[row.chain] !== options.chain) continue;
    dailyVolume.addUSDValue(Number(row.volume_usd) || 0);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  prefetch,
  fetch,
  chains: [CHAIN.BASE, CHAIN.BSC, CHAIN.ROBINHOOD, CHAIN.SOLANA],
  start: "2026-08-26",
  isExpensiveAdapter: true,
  doublecounted: true, // trades are executed on DEXs / routers that already report this volume
  methodology: {
    Volume:
      "USD value of the stablecoin leg of every buy and sell executed by a copyfomo user wallet on the same chain (a buy spends a stablecoin and receives a token in one transaction; a sell does the opposite). Wallets are identified on-chain: Solana transactions signed by the copyfomo fee payer, EVM smart accounts created by the LightAccountFactory that have paid the copyfomo treasury. Deposits, withdrawals and cash moves between a user's own wallets have no token leg and are excluded. Cross-chain trades filled by an intent solver (about 7% of trades) are not counted.",
  },
};

export default adapter;
