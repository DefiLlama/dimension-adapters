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
import {
  fetchDayTransactions,
  getTonPrice,
  nanoToTon,
} from "../../helpers/ton/groypfi";

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  try {
    // 1. TON price (throws on failure)
    const tonPrice = await getTonPrice();

    // 2. Sum incoming TON to fee wallet for the day
    const txs = await fetchDayTransactions(startTimestamp, endTimestamp);

    let feeNano = 0n;

    for (const tx of txs) {
      if (!tx.success) continue;
      if (tx.in_msg && tx.in_msg.value > 0) {
        feeNano += BigInt(tx.in_msg.value);
      }
    }

    const feeTon = nanoToTon(feeNano);
    const dailyFeesUSD = feeTon * tonPrice;

    // 100% of fees = protocol revenue (GROYP buybacks)
    return {
      dailyFees: dailyFeesUSD,
      dailyUserFees: dailyFeesUSD,
      dailyRevenue: dailyFeesUSD,
      dailyHoldersRevenue: dailyFeesUSD,
    };
  } catch (error) {
    console.error("groypfi fees fetch error:", error);
    return {
      dailyFees: 0,
      dailyUserFees: 0,
      dailyRevenue: 0,
      dailyHoldersRevenue: 0,
    };
  }
};

const methodology = {
  Fees: "Total 1% platform fees collected from all swap sources (Swap Widget, Terminal, Launchpad, @groypfi_bot).",
  UserFees: "Same as Fees — users pay the 1% platform fee on every swap.",
  Revenue: "100% of fees are protocol revenue used for GROYP token buybacks.",
  HoldersRevenue: "100% of revenue is used for GROYP token buybacks, benefiting token holders.",
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
