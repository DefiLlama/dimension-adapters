import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { assertDuneSolanaIndexed } from "../../helpers/duneSolanaDex";
import { VOLUME_SQL, withPartition } from "../../helpers/queries/copypump";

// copypump -- Telegram copy-trading bot on pump.fun (https://www.copypumpfun.com, https://x.com/copypumpfun).
// Trade volume = the USD value of every copied buy and sell executed by a copypump user wallet.
// See helpers/queries/copypump.ts for the on-chain footprint.

const prefetch = async (options: FetchOptions) => {
  assertDuneSolanaIndexed(options);
  return queryDuneSql(options, withPartition(VOLUME_SQL, options));
};

const fetch = async (options: FetchOptions) => {
  const rows: any[] = options.preFetchedResults || [];
  const dailyVolume = options.createBalances();
  for (const row of rows) dailyVolume.addUSDValue(Number(row.volume_usd) || 0);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  prefetch,
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2026-09-16",
  isExpensiveAdapter: true,
  doublecounted: true, // trades are executed on pump.fun, PumpSwap, Raydium, Meteora... which already report this volume
  methodology: {
    Volume: "USD value of every copied buy and sell: a transaction signed by the copypump fee payer that contains at least one DEX swap (dex_solana.trades on Dune). A multi-hop route is one trade valued once, at its largest hop. Deposits, withdrawals and fee collections have no swap and are not counted.",
  },
};

export default adapter;
