import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { postURL } from "../utils/fetchURL";

// Sablier Lockup: pre-funded token streams with optional cliff, used predominantly
// for project-token vesting (team / investor / airdrop allocations). Volume is the
// value paid out to recipients on chain: `amountB` on Withdraw actions only.
//
// Cancel is deliberately excluded. `_cancel` transfers only the unstreamed
// remainder back to the sender; the recipient's accrued balance stays in the
// contract (the indexer calls it `intactAmount`) until they withdraw it, which
// emits its own Withdraw action. Counting Cancel too would book that balance
// twice. Data comes from Sablier's public Envio HyperIndex; per-chain queries
// filter by chainId. Streams are pre-funded at creation so every settlement is
// funded value. Daily figures are lumpy (claim timing) but cumulative equals
// true streamed value over time.

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
  [CHAIN.LINEA]: { chainId: 59144, start: "2024-08-28" },
  [CHAIN.BLAST]: { chainId: 81457, start: "2024-02-01" },
  [CHAIN.ERA]: { chainId: 324, start: "2024-05-06" },
  [CHAIN.SONIC]: { chainId: 146, start: "2025-08-21" },
  [CHAIN.MODE]: { chainId: 34443, start: "2024-10-29" },
  [CHAIN.ABSTRACT]: { chainId: 2741, start: "2025-01-01" },
  [CHAIN.UNICHAIN]: { chainId: 130, start: "2025-08-14" },
  [CHAIN.SEI]: { chainId: 1329, start: "2025-03-28" },
  [CHAIN.BERACHAIN]: { chainId: 80094, start: "2025-02-01" },
  [CHAIN.HYPERLIQUID]: { chainId: 999, start: "2025-07-17" },
  [CHAIN.SSEED]: { chainId: 5330, start: "2024-11-01" },
  [CHAIN.MORPH]: { chainId: 2818, start: "2024-10-29" },
  [CHAIN.CHILIZ]: { chainId: 88888, start: "2024-12-01" },
  [CHAIN.XDC]: { chainId: 50, start: "2025-02-01" },
  [CHAIN.SOPHON]: { chainId: 50104, start: "2025-05-01" },
  [CHAIN.MONAD]: { chainId: 143, start: "2025-11-10" },
  [CHAIN.ROBINHOOD]: { chainId: 4663, start: "2026-07-22" },
};

interface Row {
  id: string;
  chainId: string;
  amountB: string | null;
  stream: { asset_id: string } | null;
}

// One query serves every chain in the window and the in-flight promise is
// shared, so a run costs one paginated pass rather than one per chain. The
// indexer rate-limits bursts, and the per-chain shape tripped it.
const CHAIN_IDS = Object.values(CONFIG).map(({ chainId }) => chainId);

const buildQuery = (from: number, to: number, cursor: string) => `{
  LockupAction(
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
    amountB
    stream { asset_id }
  }
}`;

const inFlight: Record<string, Promise<Row[]>> = {};

const getWindow = (from: number, to: number) => {
  const key = `${from}-${to}`;
  if (!inFlight[key])
    inFlight[key] = (async () => {
      const all: Row[] = [];
      let cursor = "";
      while (true) {
        const res: { data: { LockupAction: Row[] } } = await postURL(INDEXER, {
          query: buildQuery(from, to, cursor),
        });
        const rows = res.data.LockupAction;
        all.push(...rows);
        if (rows.length < PAGE_SIZE) break;
        cursor = rows[rows.length - 1].id;
      }
      return all;
    })();
  return inFlight[key];
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { chainId } = CONFIG[options.chain];
  const rows = await getWindow(options.fromTimestamp, options.toTimestamp);
  for (const r of rows) {
    if (Number(r.chainId) !== chainId) continue;
    if (!r.amountB || r.amountB === "0" || !r.stream?.asset_id) continue;
    // asset_id format: `asset-<chainId>-<tokenAddress>`; take the address suffix.
    const parts = r.stream.asset_id.split("-");
    const token = parts[parts.length - 1];
    dailyVolume.add(token, r.amountB);
  }
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology: {
    Volume:
      "The value of tokens Sablier Lockup actually paid out to stream recipients each day, added up per chain. Cancelling a stream is not counted: it returns the unvested remainder to whoever funded the stream, and the recipient's already-vested share stays in the contract until they claim it, at which point that claim is counted. Streams are fully funded up front, so every payout is real money moving. Lockup is used almost entirely for project-token vesting, so daily figures are lumpy and driven by vesting unlocks.",
  },
  adapter: CONFIG,
  fetch,
};

export default adapter;
