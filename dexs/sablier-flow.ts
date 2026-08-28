import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Sablier Flow: rate-based recurring payment streams (payroll, grants,
// subscriptions). Volume is value paid out to recipients: `amountA` on
// Withdraw actions.
//
// Void and Refund are excluded and must stay excluded. `_void` moves no tokens;
// its `amountB` is written-off debt the sender never funded, unbounded on an
// unfunded stream. Refund returns uncommitted deposits to the sender.

const INDEXER = "https://indexer.hyperindex.xyz/53b7e25/v1/graphql";
const PAGE_SIZE = 1000;

const CONFIG: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2024-12-01" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2024-12-01" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2024-12-01" },
  [CHAIN.BASE]: { chainId: 8453, start: "2024-12-01" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2024-12-01" },
  [CHAIN.BSC]: { chainId: 56, start: "2024-12-01" },
  [CHAIN.XDAI]: { chainId: 100, start: "2024-12-01" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2024-12-01" },
  [CHAIN.SCROLL]: { chainId: 534352, start: "2024-12-01" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2024-12-01" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2024-12-01" },
  [CHAIN.ERA]: { chainId: 324, start: "2024-12-01" },
  [CHAIN.SONIC]: { chainId: 146, start: "2024-12-01" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-12-01" },
  [CHAIN.ABSTRACT]: { chainId: 2741, start: "2025-01-01" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-02-01" },
  [CHAIN.SEI]: { chainId: 1329, start: "2024-12-01" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-02-01" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-02-01" },
};

interface Row {
  id: string;
  chainId: string;
  amountA: string | null;
  stream: { asset_id: string } | null;
}

// One shared query per window, not one per chain -- the indexer rate-limits bursts.
const CHAIN_IDS = Object.values(CONFIG).map(({ chainId }) => chainId);

const buildQuery = (from: number, to: number, cursor: string) => `{
  FlowAction(
    where: {
      category: {_eq: Withdraw}
      chainId: {_in: [${CHAIN_IDS.join(", ")}]}
      timestamp: {_gte: "${from}", _lt: "${to}"}
      id: {_gt: "${cursor}"}
    }
    order_by: {id: asc}
    limit: ${PAGE_SIZE}
  ) {
    id
    chainId
    amountA
    stream { asset_id }
  }
}`;

const fetchWindow = async (from: number, to: number) => {
  const all: Row[] = [];
  let cursor = "";
  while (true) {
    const res: { data: { FlowAction: Row[] } } = await postURL(INDEXER, {
      query: buildQuery(from, to, cursor),
    });
    const rows = res.data.FlowAction;
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
  }
  return all;
};

// Hold only the active window: keeping all of them grows unbounded on backfills,
// and dropping on settle refetches per chain when chains run sequentially.
let cached: { key: string; rows: Promise<Row[]> } | undefined;

const getWindow = (from: number, to: number) => {
  const key = `${from}-${to}`;
  if (cached?.key !== key) cached = { key, rows: fetchWindow(from, to) };
  return cached.rows;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { chainId } = CONFIG[options.chain];
  const rows = await getWindow(options.fromTimestamp, options.toTimestamp);
  for (const r of rows) {
    if (Number(r.chainId) !== chainId) continue;
    const amount = r.amountA;
    if (!amount || amount === "0" || !r.stream?.asset_id) continue;
    // asset_id format: `asset-<chainId>-<tokenAddress>`; take the address suffix.
    const parts = r.stream.asset_id.split("-");
    const token = parts[parts.length - 1];
    dailyVolume.add(token, amount);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "Value paid out to Sablier Flow stream recipients per chain. Sum of recipient amounts on `FlowAction` rows where category is Withdraw (recipient pulls accrued funds, recorded in `amountA`).Void actions are excluded. Refund actions are the sender pulling back uncommitted deposits and are excluded. Streams are pre-funded via deposits and topups. Data is sourced from Sablier's public Envio HyperIndex. Flow is the rate-based recurring-payment product used for payroll, grants, and subscriptions.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;
