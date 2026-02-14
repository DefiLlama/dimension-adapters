import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const FEE_RECIPIENT =
  "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";

const toBigInt = (v: any) => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const start = options.startTimestamp;
  const end = options.endTimestamp;

  let total = 0n;
  let before_lt: string | undefined;

  while (true) {
    const url =
      `https://tonapi.io/v2/blockchain/accounts/${FEE_RECIPIENT}/transactions` +
      `?limit=1000&sort_order=desc` +
      (before_lt ? `&before_lt=${before_lt}` : "");

    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      // If TonAPI errors mid-pagination, keep what we already accumulated
      // (partial day is better than throwing and returning nothing)
      break;
    }

    const txs = data?.transactions ?? [];
    if (!txs.length) break;

    for (const tx of txs) {
      // stop early if we've paged past the window
      if (tx.utime < start) {
        txs.length = 0;
        break;
      }
      if (tx.utime > end) continue;
      if (!tx.success) continue;

      // only count inbound to this wallet
      if (tx.in_msg?.destination === FEE_RECIPIENT) {
        total += toBigInt(tx.in_msg?.value);
      }
    }

    if (!txs.length) break;

    // paginate using last tx's lt
    before_lt = String(txs[txs.length - 1].lt);

    // small delay to reduce rate-limit risk
    await sleep(120);
  }

  dailyFees.addGasToken(total.toString());

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-01-04",
};

export default adapter;
