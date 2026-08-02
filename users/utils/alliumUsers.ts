import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { CHAIN } from "../../helpers/chains";

// only the names that differ
const ALLIUM_TO_LLAMA: Record<string, string> = {
  avalanche: CHAIN.AVAX,
  gnosis: CHAIN.XDAI,
  zksync: CHAIN.ERA,
  worldchain: CHAIN.WC,
  x_layer: CHAIN.XLAYER,
  hyperevm: CHAIN.HYPERLIQUID,
  manta_pacific: CHAIN.MANTA,
};

export const alliumToLlamaChain = (chain: string) => ALLIUM_TO_LLAMA[chain] ?? chain;

type UserRow = {
  chain: string;
  project: string;
  users: string | number;
  txs: string | number;
};

// One entry per query text, so one per day window. Bounded so a long backfill
// does not retain every window's rows, but large enough that all adapters asking
// for the same window still share a single run.
const MAX_CACHED_WINDOWS = 8;
const inflight = new Map<string, Promise<UserRow[]>>();

function runOnce(query: string): Promise<UserRow[]> {
  const cached = inflight.get(query);
  if (cached) {
    inflight.delete(query);
    inflight.set(query, cached);
    return cached;
  }

  const run = queryAllium(query).catch((e: any) => {
    inflight.delete(query);
    throw e;
  });
  inflight.set(query, run);

  while (inflight.size > MAX_CACHED_WINDOWS) {
    inflight.delete(inflight.keys().next().value as string);
  }
  return run;
}

function getDexUserRows(options: FetchOptions): Promise<UserRow[]> {
  // GROUPING SETS returns per-chain and all-chain rows in one pass. The
  // all-chain row cannot be a sum: a wallet on two chains is still one user.
  const query = `
SELECT
  COALESCE(chain, '${CHAIN.CHAIN_GLOBAL}') AS chain,
  project,
  COUNT(DISTINCT transaction_from_address) AS users,
  COUNT(DISTINCT transaction_hash) AS txs
FROM crosschain.dex.trades
WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
  AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
GROUP BY GROUPING SETS ((chain, project), (project))`;

  return runOnce(query);
}

// Liquidations are excluded: the address acting is a liquidator bot, not someone
// using the protocol.
const LENDING_EVENTS = ["deposits", "withdrawals", "loans", "repayments"];

function getLendingUserRows(options: FetchOptions): Promise<UserRow[]> {
  const window = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const query = `
SELECT
  COALESCE(chain, '${CHAIN.CHAIN_GLOBAL}') AS chain,
  project,
  COUNT(DISTINCT transaction_from_address) AS users,
  COUNT(DISTINCT transaction_hash) AS txs
FROM (
${LENDING_EVENTS.map((event) => `  SELECT chain, COALESCE(project, protocol) AS project, transaction_from_address, transaction_hash
  FROM crosschain.lending.${event}
  WHERE ${window}`).join("\n  UNION ALL\n")}
)
GROUP BY GROUPING SETS ((chain, project), (project))`;

  return runOnce(query);
}

function buildUsersAdapter({ project, chains, start, getRows, methodology, emptyError }: {
  project: string;
  chains: string[] | Record<string, string>;
  start: string;
  getRows: (options: FetchOptions) => Promise<UserRow[]>;
  methodology: Record<string, string>;
  emptyError: string;
}): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const rows = await getRows(options);
    if (!rows.length) throw new Error(`${emptyError} for ${options.startTimestamp}`);

    const row = rows.find((r) => r.project === project && alliumToLlamaChain(r.chain) === options.chain);
    if (!row) return { dailyActiveUsers: 0, dailyTransactionsCount: 0 };

    return {
      dailyActiveUsers: Number(row.users),
      dailyTransactionsCount: Number(row.txs),
    };
  };

  const chainStarts: Record<string, string> = Array.isArray(chains)
    ? Object.fromEntries(chains.map((chain) => [chain, start]))
    : { ...chains };

  const chainList = Object.keys(chainStarts);
  if (chainList.length > 1) {
    chainStarts[CHAIN.CHAIN_GLOBAL] = chainList.map((chain) => chainStarts[chain]).sort()[0];
  }

  return {
    version: 1,
    fetch,
    adapter: Object.fromEntries(chainList.concat(chainList.length > 1 ? [CHAIN.CHAIN_GLOBAL] : [])
      .map((chain) => [chain, { start: chainStarts[chain] }])),
    dependencies: [Dependencies.ALLIUM],
    methodology,
  };
}

// Users are transaction_from_address, never sender_address (a router or pool).
// `chains` is a list sharing `start`, or a chain -> first-trade-date map so a
// late-launching chain does not backfill zeros from before it existed.
export function alliumDexUsersExport(config: {
  project: string;
  chains: string[] | Record<string, string>;
  start: string;
}): SimpleAdapter {
  return buildUsersAdapter({
    ...config,
    getRows: getDexUserRows,
    emptyError: "Allium returned no dex trades",
    methodology: {
      ActiveUsers: "Unique wallets that swapped on the protocol that day. Counted per chain, plus an all-chains total that counts a wallet trading on several chains only once.",
      TransactionsCount: "Number of transactions containing at least one swap on the protocol.",
    },
  });
}

// transaction_from_address, not depositor_address: the depositor is often a vault
// or curator contract, while the tx sender is the wallet that acted.
export function alliumLendingUsersExport(config: {
  project: string;
  chains: string[] | Record<string, string>;
  start: string;
}): SimpleAdapter {
  return buildUsersAdapter({
    ...config,
    getRows: getLendingUserRows,
    emptyError: "Allium returned no lending events",
    methodology: {
      ActiveUsers: "Unique wallets that supplied, withdrew, borrowed or repaid on the protocol that day. Liquidations are excluded because the liquidator is not the user. Counted per chain, plus an all-chains total that counts a wallet active on several chains only once.",
      TransactionsCount: "Number of transactions containing at least one supply, withdraw, borrow or repay on the protocol.",
    },
  });
}
