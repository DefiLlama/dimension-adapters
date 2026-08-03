import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

// only the names that differ
const DUNE_TO_LLAMA: Record<string, string> = {
  bnb: CHAIN.BSC,
  avalanche_c: CHAIN.AVAX,
  gnosis: CHAIN.XDAI,
  zksync: CHAIN.ERA,
};

const duneToLlamaChain = (chain: string) => DUNE_TO_LLAMA[chain] ?? chain;

type UserRow = {
  chain: string;
  project: string;
  users: string | number;
  txs: string | number;
};

const MAX_CACHED_WINDOWS = 8;
const inflight = new Map<string, Promise<UserRow[]>>();

function runOnce(options: FetchOptions, query: string): Promise<UserRow[]> {
  const cached = inflight.get(query);
  if (cached) {
    inflight.delete(query);
    inflight.set(query, cached);
    return cached;
  }

  const run = queryDuneSql(options, query).catch((e: any) => {
    inflight.delete(query);
    throw e;
  });
  inflight.set(query, run);

  while (inflight.size > MAX_CACHED_WINDOWS) {
    inflight.delete(inflight.keys().next().value as string);
  }
  return run;
}

// Liquidations are excluded because the address acting is a liquidator bot.
function getRows(options: FetchOptions): Promise<UserRow[]> {
  const window = (col: string) =>
    `${col} >= from_unixtime(${options.startTimestamp}) AND ${col} < from_unixtime(${options.endTimestamp})`;

  const leg = (table: string) => `  SELECT blockchain, project, version, tx_hash
  FROM lending.${table}
  WHERE ${window("block_time")} AND transaction_type NOT LIKE '%liquidation%'`;

  const query = `
WITH ev AS (
${leg("supply")}
  UNION ALL
${leg("borrow")}
)
SELECT
  COALESCE(ev.blockchain, '${CHAIN.CHAIN_GLOBAL}') AS chain,
  ev.project || '_v' || CAST(ev.version AS varchar) AS project,
  count(distinct t."from") AS users,
  count(distinct ev.tx_hash) AS txs
FROM ev
JOIN evms.transactions t ON t.hash = ev.tx_hash AND t.blockchain = ev.blockchain
  AND ${window("t.block_time")}
GROUP BY GROUPING SETS ((ev.blockchain, ev.project, ev.version), (ev.project, ev.version))`;

  return runOnce(options, query);
}

// `chains` maps a repo chain id to that chain's first-event date, so a late-launching
// deployment does not backfill zeros from before it existed.
export function duneLendingUsersExport({ project, version, chains }: {
  project: string;
  version: number;
  chains: Record<string, string>;
}): SimpleAdapter {
  const key = `${project}_v${version}`;

  const prefetch = async (options: FetchOptions) => getRows(options);

  const fetch = async (options: FetchOptions) => {
    const rows: UserRow[] = options.preFetchedResults;
    if (!rows.length) throw new Error(`Dune returned no lending events for ${options.startTimestamp}`);

    const row = rows.find((r) => r.project === key && duneToLlamaChain(r.chain) === options.chain);
    if (!row) return { dailyActiveUsers: 0, dailyTransactionsCount: 0 };

    return {
      dailyActiveUsers: Number(row.users),
      dailyTransactionsCount: Number(row.txs),
    };
  };

  const chainStarts = { ...chains };
  const chainList = Object.keys(chainStarts);
  if (chainList.length > 1) {
    chainStarts[CHAIN.CHAIN_GLOBAL] = chainList.map((chain) => chainStarts[chain]).sort()[0];
  }

  return {
    version: 1,
    fetch,
    prefetch,
    adapter: Object.fromEntries(Object.keys(chainStarts).map((chain) => [chain, { start: chainStarts[chain] }])),
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology: {
      ActiveUsers: "Unique wallets that supplied, withdrew, borrowed or repaid on the protocol that day. Liquidations are excluded because the liquidator is not the user. Counted per chain, plus an all-chains total that counts a wallet active on several chains only once.",
      TransactionsCount: "Number of transactions containing at least one supply, withdraw, borrow or repay on the protocol.",
    },
  };
}
