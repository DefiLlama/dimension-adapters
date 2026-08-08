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

// One entry per query text (one per day window), so adapters sharing a window
// share one run. Bounded so backfills don't retain every window.
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

// Liquidations excluded: the actor is a liquidator bot, not a user.
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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Token-shaped protocols (liquid staking, RWA) have no curated table: a user is a
// wallet that minted the token (entry) or sent it to a burn/exit address (exit).
// Queued withdrawals burn later on protocol finalisation, hence the exit address.
export type TokenUsersConfig = {
  id: string;
  chain: string;
  token: string;
  exitAddresses?: string[];
  start: string;
};

const tokenConfigs: TokenUsersConfig[] = [];

function getTokenUserRows(options: FetchOptions): Promise<UserRow[]> {
  const tokens = tokenConfigs.map((c) => `'${c.token.toLowerCase()}'`).join(", ");

  // Each exit address belongs to one protocol, so it is paired with its own token
  const entryOrExit = [
    `LOWER(from_address) = '${ZERO_ADDRESS}'`,
    `LOWER(to_address) = '${ZERO_ADDRESS}'`,
    ...tokenConfigs
      .filter((c) => c.exitAddresses?.length)
      .map((c) => `(LOWER(token_address) = '${c.token.toLowerCase()}'`
        + ` AND LOWER(to_address) IN (${c.exitAddresses!.map((a) => `'${a.toLowerCase()}'`).join(", ")}))`),
  ].join("\n    OR ");

  const query = `
SELECT
  chain,
  LOWER(token_address) AS project,
  COUNT(DISTINCT transaction_from_address) AS users,
  COUNT(DISTINCT transaction_hash) AS txs
FROM crosschain.assets.transfers
WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
  AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  AND LOWER(token_address) IN (${tokens})
  AND (
    ${entryOrExit}
  )
GROUP BY 1, 2`;

  return runOnce(query);
}

export function alliumTokenUsersExport(config: TokenUsersConfig): SimpleAdapter {
  tokenConfigs.push(config);
  return buildUsersAdapter({
    project: config.token.toLowerCase(),
    chains: { [config.chain]: config.start },
    start: config.start,
    getRows: getTokenUserRows,
    emptyError: "Allium returned no token transfers",
    methodology: {
      ActiveUsers: "Unique wallets that entered or exited the protocol that day, counted from mints of its token plus transfers into its withdrawal contract.",
      TransactionsCount: "Number of transactions minting or redeeming the protocol's token.",
    },
  });
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
// `chains`: a list sharing `start`, or chain -> first-trade-date so a late chain
// doesn't backfill zeros.
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
