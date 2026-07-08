import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Chia coin-set node RPC. get_block_records returns records in [start, end),
// each with `fees` (transaction fees, in mojo) and `timestamp`
const RPC = "https://api.coinset.org";
const MOJO_PER_XCH = 1e12;
const PAGE = 1000; // coinset caps get_block_records at 1000 blocks/call
const PROBE = 32; // window scanned to skip past null-timestamp (non-tx) blocks

const getBlockRecords = async (start: number, end: number): Promise<any[]> => {
  const res = await httpPost(`${RPC}/get_block_records`, { start, end });
  if (!res?.success) throw new Error(`Chia: get_block_records(${start}, ${end}) failed`);
  return res.block_records ?? [];
};

// Smallest height whose timestamp is >= target, via plain binary search over the
// height range. Non-transaction blocks have null timestamps, so at each midpoint we
// probe a small window forward and read the first real timestamp.
const heightAtOrAfter = async (target: number, peak: number): Promise<number> => {
  let lo = 0;
  let hi = peak;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const recs = await getBlockRecords(mid, Math.min(mid + PROBE, peak + 1));
    const ts = recs.find((r) => r.timestamp != null)?.timestamp;
    if (ts == null) throw new Error(`Chia: no transaction block in [${mid}, ${mid + PROBE})`);
    if (Number(ts) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const state = await httpPost(`${RPC}/get_blockchain_state`, {});
  const peak = Number(state?.blockchain_state?.peak?.height);
  if (!Number.isFinite(peak)) throw new Error("Chia: could not read peak height");

  const startHeight = await heightAtOrAfter(options.startTimestamp, peak);
  const endHeight = await heightAtOrAfter(options.endTimestamp, peak);

  let feesMojo = 0;
  for (let h = startHeight; h < endHeight; h += PAGE) {
    const recs = await getBlockRecords(h, Math.min(h + PAGE, endHeight));
    for (const r of recs) {
      const ts = r.timestamp;
      if (ts == null) continue; // non-transaction block: no fees
      if (Number(ts) >= options.startTimestamp && Number(ts) < options.endTimestamp) {
        feesMojo += Number(r.fees ?? 0); // fees are null on non-tx blocks (already skipped)
      }
    }
  }

  dailyFees.addCGToken("chia", feesMojo / MOJO_PER_XCH);

  // Chia does not burn fees; transaction fees are paid to farmers (block producers).
  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue: dailyFees };
};

const methodology = {
  Fees: "Transaction fees paid by users on the Chia blockchain, summed from each block's transaction fees (block rewards excluded).",
  Revenue: "None. Chia transaction fees are not burned.",
  SupplySideRevenue: "Chia transaction fees are paid to farmers (block producers).",
};

const adapter: Adapter = {
  version: 2,
  // pullHourly disabled: each run seeds and refines a search over ~9M block heights
  // plus per-block paging; hourly granularity would multiply that RPC load ~24x.
  pullHourly: false,
  fetch,
  chains: [CHAIN.CHIA],
  start: "2021-03-19", // Chia mainnet genesis
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;
