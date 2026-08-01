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

type DexUserRow = {
  chain: string;
  project: string;
  users: string | number;
  txs: string | number;
};

// queryAllium memoises on query text, so all of them share one run per day.
const inflight: Record<string, Promise<DexUserRow[]>> = {};

function getDexUserRows(options: FetchOptions): Promise<DexUserRow[]> {
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

  // drop a failed run, else every later chain reuses the rejection
  if (!inflight[query])
    inflight[query] = queryAllium(query).catch((e: any) => {
      delete inflight[query];
      throw e;
    });
  return inflight[query];
}

// Users are transaction_from_address, never sender_address (a router or pool).
// `chains` is a list sharing `start`, or a chain -> first-trade-date map so a
// late-launching chain does not backfill zeros from before it existed.
export function alliumDexUsersExport({ project, chains, start }: {
  project: string;
  chains: string[] | Record<string, string>;
  start: string;
}): SimpleAdapter {
  const fetch = async (options: FetchOptions) => {
    const rows = await getDexUserRows(options);
    if (!rows.length) throw new Error(`Allium returned no dex trades for ${options.startTimestamp}`);

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
    methodology: {
      ActiveUsers: "Unique wallets that swapped on the protocol that day. Counted per chain, plus an all-chains total that counts a wallet trading on several chains only once.",
      TransactionsCount: "Number of transactions containing at least one swap on the protocol.",
    },
  };
}
