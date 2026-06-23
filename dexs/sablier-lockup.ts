import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Sablier Lockup: pre-funded token streams with optional cliff, used predominantly
// for project-token vesting (team / investor / airdrop allocations). Volume is the
// value paid out to recipients on chain. We sum `amountB` across two action
// categories: Withdraw (recipient pulls accrued funds) and Cancel (auto-settles
// the accrued-but-unwithdrawn portion to the recipient on cancellation). Both
// record the recipient amount in `amountB`. Data comes from Sablier's public
// Envio HyperIndex; per-chain queries filter by chainId. Streams are pre-funded
// at creation so every settlement is funded value. Daily figures are lumpy
// (claim/cancel timing) but cumulative equals true streamed value over time.

const INDEXER = "https://indexer.hyperindex.xyz/53b7e25/v1/graphql";
const PAGE_SIZE = 1000;

const CONFIG: Record<string, { chainId: number; start: string }> = {
  [CHAIN.ETHEREUM]: { chainId: 1, start: "2023-07-01" },
  [CHAIN.ARBITRUM]: { chainId: 42161, start: "2023-07-01" },
  [CHAIN.OPTIMISM]: { chainId: 10, start: "2023-07-01" },
  [CHAIN.BASE]: { chainId: 8453, start: "2023-08-01" },
  [CHAIN.POLYGON]: { chainId: 137, start: "2023-07-01" },
  [CHAIN.BSC]: { chainId: 56, start: "2023-07-01" },
  [CHAIN.XDAI]: { chainId: 100, start: "2023-07-01" },
  [CHAIN.AVAX]: { chainId: 43114, start: "2023-07-01" },
  [CHAIN.SCROLL]: { chainId: 534352, start: "2023-10-01" },
  [CHAIN.LINEA]: { chainId: 59144, start: "2023-07-01" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2024-02-01" },
  [CHAIN.ERA]: { chainId: 324, start: "2023-07-01" },
  [CHAIN.SONIC]: { chainId: 146, start: "2024-12-01" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-01-01" },
  [CHAIN.ABSTRACT]: { chainId: 2741, start: "2025-01-01" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-02-01" },
  [CHAIN.SEI]: { chainId: 1329, start: "2024-12-01" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-02-01" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-02-01" },
};

interface Row {
  id: string;
  amountB: string | null;
  stream: { asset_id: string } | null;
}

const buildQuery = (chainId: number, from: number, to: number, cursor: string) => `{
  LockupAction(
    where: {
      category: {_in: [Withdraw, Cancel]}
      chainId: {_eq: ${chainId}}
      timestamp: {_gte: "${from}", _lt: "${to}"}
      id: {_gt: "${cursor}"}
    }
    order_by: {id: asc}
    limit: ${PAGE_SIZE}
  ) {
    id
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
    const res: { data: { LockupAction: Row[] } } = await postURL(INDEXER, { query });
    const rows = res.data.LockupAction;
    if (!rows.length) break;
    for (const r of rows) {
      if (!r.amountB || r.amountB === "0" || !r.stream?.asset_id) continue;
      // asset_id format: `asset-<chainId>-<tokenAddress>`; take the address suffix.
      const parts = r.stream.asset_id.split("-");
      const token = parts[parts.length - 1];
      dailyVolume.add(token, r.amountB);
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
      "Value paid out to Sablier Lockup stream recipients per chain. Sum of `amountB` on `LockupAction` rows where category is Withdraw (recipient pulls accrued funds) or Cancel (auto-settles the accrued-but-unwithdrawn portion to the recipient on cancellation). Streams are pre-funded at creation so every settlement is funded value. Data is sourced from Sablier's public Envio HyperIndex. Lockup is overwhelmingly used for project-token vesting, so daily volume is dominated by vesting unlocks.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;
