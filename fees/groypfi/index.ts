/**
 * GroypFi — Fees & Revenue on TON
 *
 * GroypFi charges a 1% platform fee on every swap routed through its
 * aggregator (DeDust, STON.fi, Tonco, Bidask).
 * 100% of collected fees are protocol revenue used for GROYP buybacks.
 *
 * Fee wallet (user-friendly): UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
 * Fee wallet (raw):           0:eee0084ffffc92aea4f46679ded118172103f723e2e206619a9eddf42b8845d4
 *
 * Sources: Swap Widget, Terminal, Launchpad, @groypfi_bot
 * Website: https://groypfi.io
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

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

async function fetchDayTransactions(
  startTs: number,
  endTs: number,
): Promise<TonTransaction[]> {
  const collected: TonTransaction[] = [];
  let beforeLt: string | undefined;
  const limit = 256;

  while (true) {
    let url = `${TON_API}/blockchain/accounts/${FEE_WALLET_RAW}/transactions?limit=${limit}&sort_order=desc`;
    if (beforeLt) url += `&before_lt=${beforeLt}`;

    const page: TxPage = await httpGet(url);
    const txs = page.transactions ?? [];
    if (txs.length === 0) break;

    for (const tx of txs) {
      if (tx.utime < startTs) return collected;
      if (tx.utime < endTs && tx.utime >= startTs) {
        collected.push(tx);
      }
    }

    beforeLt = txs[txs.length - 1].lt;
    if (txs.length < limit) break;
  }

  return collected;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  // 1. TON price
  const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
  const rates: RatesResponse = await httpGet(ratesUrl);
  const tonPrice = rates.rates?.TON?.prices?.USD ?? 3.5;

  // 2. Sum incoming TON to fee wallet for the day
  const txs = await fetchDayTransactions(startTimestamp, endTimestamp);

  let feeNano = 0n;

  for (const tx of txs) {
    if (!tx.success) continue;
    if (tx.in_msg && tx.in_msg.value > 0) {
      feeNano += BigInt(tx.in_msg.value);
    }
  }

  const feeTon = Number(feeNano) / 1e9;
  const dailyFeesUSD = feeTon * tonPrice;

  // 100% of fees = protocol revenue (GROYP buybacks)
  return {
    dailyFees: dailyFeesUSD,
    dailyUserFees: dailyFeesUSD,
    dailyRevenue: dailyFeesUSD,
  };
};

const methodology = {
  Fees: "Total 1% platform fees collected from all swap sources (Swap Widget, Terminal, Launchpad, @groypfi_bot).",
  UserFees: "Same as Fees — users pay the 1% platform fee on every swap.",
  Revenue: "100% of fees are protocol revenue used for GROYP token buybacks.",
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
