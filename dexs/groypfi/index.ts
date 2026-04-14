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

const FEE_WALLET_RAW =
  "0:eee0084ffffc92aea4f46679ded118172103f723e2e206619a9eddf42b8845d4";
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

  // eslint-disable-next-line no-constant-condition
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

async function getTonPrice(): Promise<number> {
  const ratesUrl = `${TON_API}/rates?tokens=ton&currencies=usd`;
  const rates: RatesResponse = await httpGet(ratesUrl);
  const price = rates.rates?.TON?.prices?.USD;

  if (price === undefined || price === null || price <= 0) {
    throw new Error(
      "groypfi: Unable to fetch TON/USD price from TonAPI",
    );
  }

  return price;
}

function nanoToTon(nano: bigint): number {
  const whole = nano / 1_000_000_000n;
  const remainder = nano % 1_000_000_000n;
  return Number(whole) + Number(remainder) / 1e9;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;

  try {
    const tonPrice = await getTonPrice();
    const txs = await fetchDayTransactions(startTimestamp, endTimestamp);

    let feeNano = 0n;

    for (const tx of txs) {
      if (!tx.success) continue;
      if (tx.in_msg && tx.in_msg.value > 0) {
        feeNano += BigInt(tx.in_msg.value);
      }
    }

    // Volume = fee / 0.01  (1% fee → multiply by 100)
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
