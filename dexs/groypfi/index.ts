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
import {
  fetchDayTransactions,
  getTonPrice,
  nanoToTon,
} from "../../helpers/ton/groypfi";

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  try {
    // 1. Get TON price in USD (throws on failure)
    const tonPrice = await getTonPrice();

    // 2. Collect all incoming TON transfers in the day window
    const txs = await fetchDayTransactions(startTimestamp, endTimestamp);

    let feeNano = 0n;

    for (const tx of txs) {
      if (!tx.success) continue;
      if (tx.in_msg && tx.in_msg.value > 0) {
        feeNano += BigInt(tx.in_msg.value);
      }
    }

    // 3. Volume = fee / 0.01  (1% fee → multiply by 100)
    const volumeNano = feeNano * 100n;
    const volumeTon = nanoToTon(volumeNano);
    const dailyVolumeUSD = volumeTon * tonPrice;

    return {
      dailyVolume: dailyVolumeUSD,
    };
  } catch (error) {
    console.error("groypfi dexs fetch error:", error);
    return {
      dailyVolume: 0,
    };
  }
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
