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
 * Fee wallet (raw):           0:eee0084ffffc92aea4f46679ded118172103f723e2e206619a9eddf42b8845d4
 *
 * Website: https://groypfi.io
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// House fee wallet — receives 1% of every swap across all products
const FEE_WALLET_RAW = "0:eee0084ffffc92aea4f46679ded118172103f723e2e206619a9eddf42b8845d4";

const TON_API = "https://tonapi.io/v2";

interface TonTransaction {
  hash: string;
  lt: string;
  utime: number;
  success: boolean;
  in_msg?: {
    value: number;
    msg_type: string;
    source?: { address: string };
  };
}

interface TxPage {
  transactions: TonTransaction[];
}

interface RatesResponse {
  rates: Record<string, { prices: Record<string, number> }>;
}

/**
 * Paginate through all transactions in the [startOfDay, endOfDay) window.
 * TonAPI returns newest-first; we stop when we pass startOfDay.
 */
async function fetchDayTransactions(
  startTs: number,
  endTs: number,
): Promise<TonTransaction[]> {
  const collected: TonTransaction[] = [];
  let beforeLt: string | undefined;
  const limit = 256;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let url = `${TON_API}/blockchain/accounts/${FEE_WALLET_RAW}/transactions?limit=${limit}&sort_order=desc`;
    if (beforeLt) url += `&before_lt=${beforeLt}`;

    const page: TxPage = await httpGet(url);
    const txs = page.transactions ?? [];
    if (txs.length === 0) break;

    for (const tx of txs) {
      if (tx.utime < startTs) return collected; // past our window
      if (tx.utime < endTs && tx.utime >= startTs) {
        collected.push(tx);
      }
    }

    beforeLt = txs[txs.length - 1].lt;
    if (txs.length < limit) break; // no more pages
  }

  return collected;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  // 1. Get TON price in USD
  const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
  const rates: RatesResponse = await httpGet(ratesUrl);
  const tonPrice = rates.rates?.TON?.prices?.USD ?? 3.5;

  // 2. Collect all incoming TON transfers in the day window
  const txs = await fetchDayTransactions(startTimestamp, endTimestamp);

  let feeNano = 0n;

  for (const tx of txs) {
    if (!tx.success) continue;
    // Only count incoming TON value (in_msg with value > 0)
    if (tx.in_msg && tx.in_msg.value > 0) {
      feeNano += BigInt(tx.in_msg.value);
    }
  }

  // 3. Volume = fee / 0.01  (1% fee → multiply by 100)
  const volumeNano = feeNano * 100n;
  const volumeTon = Number(volumeNano) / 1e9;
  const dailyVolumeUSD = volumeTon * tonPrice;

  return {
    dailyVolume: dailyVolumeUSD,
  };
};

const methodology = {
  Volume:
    "DEX aggregation volume reverse-calculated from the 1% platform fee collected at the house fee wallet. " +
    "Includes volume from Swap Widget, Terminal Quick Buy, Launchpad trading, and @groypfi_bot Telegram bot.",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: "2025-01-01",
      meta: { methodology },
    },
  },
};

export default adapter;
