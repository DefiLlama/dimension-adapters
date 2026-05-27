import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

/**
 * GroypFi — DEX Aggregator on TON
 *
 * GroypFi aggregates liquidity across DeDust, STON.fi, Tonco, and Bidask
 * for optimal swap routing on the TON blockchain.
 *
 * Volume sources:
 *   - Swap Widget (web app)
 *   - Terminal Quick Buy (web app)
 *   - Launchpad token trading (web app)
 *   - @groypfi_bot (Telegram trading bot)
 *
 * All swaps carry a 1% platform fee sent to the house fee wallet.
 * Daily volume is reverse-calculated: volume = fee_inflow / 0.01
 *
 * Fee wallet (user-friendly): UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 * Fee wallet (raw):           0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594
 *
 * Website: https://groypfi.io
 */

const FEE_RECIPIENT = "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594";

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
    const url = `https://tonapi.io/v2/blockchain/accounts/${FEE_RECIPIENT}/transactions?limit=1000&sort_order=desc${before_lt && before_hash ? `&before_lt=${before_lt}&before_hash=${before_hash}` : ""}`;
    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      throw new Error(`Failed to fetch transactions: ${e}`);
    }

    const txs = data.transactions;
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

      if (tx.in_msg.destination.address === FEE_RECIPIENT) {
        total += toBigInt(tx.in_msg.value);
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
  const dailyVolume = dailyFees.clone(100);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "DEX aggregation volume reverse-calculated from the 1% platform fee collected at the house fee wallet."+
  "Sources: Swap Widget (web app), Terminal Quick Buy (web app), Launchpad token trading (web app), @groypfi_bot (Telegram trading bot)",
  Fees: "All the inflows to protcol wallet is considered as fees",
  Revenue: "All the inflows to protcol wallet is considered as revenue",
  ProtocolRevenue: "All the inflows to protcol wallet is considered as protocol revenue",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-01-04",
  methodology,
  //pullHourly: true
};

export default adapter;
