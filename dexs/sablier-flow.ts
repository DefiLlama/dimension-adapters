import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Sablier Flow: rate-based recurring payment streams (payroll, grants,
// subscriptions). Funded by deposits and topups. Volume is the value paid out to
// recipients on chain. We sum two action categories: Withdraw (recipient pulls
// accrued funds, recorded in `amountA` for Flow's single-party shape) and Void
// (auto-settles the accrued-but-unwithdrawn portion to the recipient on stream
// termination, recorded in `amountB` for the two-party shape). Refund is the
// sender pulling back uncommitted deposits and is excluded. Data comes from
// Sablier's public Envio HyperIndex; per-chain queries filter by chainId. Daily
// figures are lumpy (claim/void timing) but cumulative equals true streamed value.

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
  category: "Withdraw" | "Void";
  amountA: string | null;
  amountB: string | null;
  stream: { asset_id: string } | null;
}

const buildQuery = (chainId: number, from: number, to: number, cursor: string) => `{
  FlowAction(
    where: {
      category: {_in: [Withdraw, Void]}
      chainId: {_eq: ${chainId}}
      timestamp: {_gte: "${from}", _lt: "${to}"}
      id: {_gt: "${cursor}"}
    }
    order_by: {id: asc}
    limit: ${PAGE_SIZE}
  ) {
    id
    category
    amountA
    amountB
    stream { asset_id }
  }
}`;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const cfg = CONFIG[options.chain];
  let cursor = "";
  while (true) {
    const query = buildQuery(cfg.chainId, options.fromTimestamp, options.toTimestamp, cursor);
    const res: { data: { FlowAction: Row[] } } = await postURL(INDEXER, { query });
    const rows = res.data.FlowAction;
    if (!rows.length) break;
    for (const r of rows) {
      const amount = r.amountA;
      if (!amount || amount === "0" || !r.stream?.asset_id || r.category !== "Withdraw") continue;
      // asset_id format: `asset-<chainId>-<tokenAddress>`; take the address suffix.
      const parts = r.stream.asset_id.split("-");
      const token = parts[parts.length - 1];
      dailyVolume.add(token, amount);
    }
    if (rows.length < PAGE_SIZE) break;
    cursor = rows[rows.length - 1].id;
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
