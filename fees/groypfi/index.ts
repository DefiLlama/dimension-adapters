 import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

const FEE_RECIPIENT =
  "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";

const toBigInt = (v: any) => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const start = options.startTimestamp;
  const end = options.endTimestamp;

  let total = 0n;
  let before_lt: string | undefined;
  let before_hash: string | undefined;

  const seen = new Set<string>();

  while (true) {
    const url =
      `https://tonapi.io/v2/blockchain/accounts/${FEE_RECIPIENT}/transactions` +
      `?limit=1000&sort_order=desc` +
      (before_lt && before_hash
        ? `&before_lt=${before_lt}&before_hash=${before_hash}`
        : "");

    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      // partial day is better than returning nothing
      break;
    }

    const txs = data?.transactions ?? [];
    if (!txs.length) break;

    let reachedBeforeStart = false;

    for (const tx of txs) {
      const key = tx.hash ?? `${tx.lt}:${tx.utime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (tx.utime < start) {
        reachedBeforeStart = true;
        break;
      }

      if (tx.utime >= end) continue; // exclusive upper bound
      if (!tx.success) continue;

      if (tx.in_msg?.destination === FEE_RECIPIENT) {
        total += toBigInt(tx.in_msg?.value);
      }
    }

    if (reachedBeforeStart) break;

    const lastTx = txs[txs.length - 1];
    if (lastTx?.lt == null || lastTx?.hash == null) break;

    before_lt = String(lastTx.lt);
    before_hash = String(lastTx.hash);

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
