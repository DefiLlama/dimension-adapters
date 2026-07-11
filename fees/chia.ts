import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

// Chia coin-set node API. get_block_records returns records in [start, end), each
// with `fees` (transaction fees, in mojo) and `timestamp`. Non-transaction blocks
// carry null fees/timestamp. 1 XCH = 1e12 mojo. 
const API = "https://api.coinset.org";
const MOJO_PER_XCH = 1e12;
const PAGE = 1000; // coinset caps get_block_records at 1000 blocks/call

const getBlockRecords = async (start: number, end: number): Promise<any[]> => {
  const res = await httpPost(`${API}/get_block_records`, { start, end });
  if (!res?.success) throw new Error(`Chia: get_block_records(${start}, ${end}) failed`);
  if (!Array.isArray(res.block_records)) throw new Error(`Chia: get_block_records(${start}, ${end}) returned no records`);
  return res.block_records;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const startHeight = await options.getFromBlock();
  const endHeight = await options.getToBlock();

  let feesMojo = 0;
  for (let h = startHeight; h <= endHeight; h += PAGE) {
    const recs = await getBlockRecords(h, Math.min(h + PAGE, endHeight + 1));
    for (const r of recs) {
      const ts = r.timestamp;
      if (ts == null) continue; // non-transaction block: no fees
      if (Number(ts) >= options.startTimestamp && Number(ts) < options.endTimestamp) {
        const fee = Number(r.fees);
        if (!Number.isFinite(fee)) throw new Error(`Chia: non-finite fee at block ${r.height}`);
        feesMojo += fee;
      }
    }
  }

  const xch = feesMojo / MOJO_PER_XCH;
  dailyFees.addCGToken("chia", xch, "Transaction Fees");
  dailySupplySideRevenue.addCGToken("chia", xch, "Transaction Fees To Farmers");

  return { dailyFees, dailyRevenue: 0, dailySupplySideRevenue };
};

const methodology = {
  Fees: "Transaction fees paid by users on the Chia blockchain, summed from each block's transaction fees (block rewards excluded).",
  Revenue: "None. Chia transaction fees are not burned.",
  SupplySideRevenue: "Chia transaction fees are paid to farmers (block producers).",
};

const breakdownMethodology = {
  Fees: {
    "Transaction Fees": "Transaction fees paid by users, summed per block (block rewards excluded).",
  },
  SupplySideRevenue: {
    "Transaction Fees To Farmers": "All transaction fees are paid to farmers (block producers).",
  },
};

const adapter: Adapter = {
  version: 2,
  // pullHourly disabled: fees are paged per-block over the whole day; daily
  // granularity keeps the coinset API load low.
  pullHourly: false,
  fetch,
  chains: [CHAIN.CHIA],
  start: "2021-03-19", // Chia mainnet genesis
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;
