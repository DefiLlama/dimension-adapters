/**
 * GroypFi — Fees & Revenue on TON
 *
 * GroypFi is a multi-product trading platform on TON. A platform fee is
 * charged on every trade routed through any of its products:
 *   - DEX Aggregator (DeDust, STON.fi, Tonco, Bidask)
 *   - Trading Terminal
 *   - Cross-Chain Swap
 *   - NFT Aggregator
 *   - Token Launchpad (topblast.lol)
 *   - Perpetuals Platform
 *   - Gbot Telegram Trading Bot (@groypfi_bot)
 *
 * All of these fees settle into the GroypFi house fee wallets below.
 * 65–80% of collected revenue is used for $GROYP buybacks, executed from
 * the buyback wallet UQCnkAaVs7fNpub-w3NfFVYmQtVUldPc7RZj2_CMiKoXfikn.
 *
 * Website: https://groypfi.io
 * Twitter: https://x.com/groypfi
 * Contact: zeuraph7@gmail.com
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// House fee wallets (all inflows are protocol fees)
const FEE_WALLETS: string[] = [
  // UQDu4AiT__JKuqT0Znje0RoXIQMPcj4uIGYZme3UK4hFlE_Q
  "0:eee00893fff24abaa4f46678ded11a1721030f723e2e20661999edd42b884594",
  // UQCvlNDUcVJq55xVNV9BvCC1KUaMVUetnUkr_sSovHTLmTsj
  "0:af94d0d471526ae79c55355f41bc20b529468c5547ad9d492bfec4a8bc74cb99",
  // UQAuMfZUcQoiOt-S4vWJhlT2Qlewgrmi99AQ4ISEjDCAIR-i
  "0:2e31f654710a223adf92e2f5898654f64257b082b9a2f7d010e084848c308021",
  // UQDz_6Hyrq2AgMIWw4S5xPH9OBMcaerRp14y94T-cRJistBx
  "0:f3ffa1f2aead8080c216c384b9c4f1fd38131c69ead1a75e32f784fe711262b2",
];

// Share of revenue routed into $GROYP buybacks (65–80%, conservative midpoint)
const BUYBACK_SHARE = 0.725;

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
  account: string,
  startTs: number,
  endTs: number,
): Promise<TonTransaction[]> {
  const collected: TonTransaction[] = [];
  let beforeLt: string | undefined;
  const limit = 256;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let url = `${TON_API}/blockchain/accounts/${account}/transactions?limit=${limit}&sort_order=desc`;
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
    throw new Error("groypfi: Unable to fetch TON/USD price from TonAPI");
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

    const perWallet = await Promise.all(
      FEE_WALLETS.map((w) =>
        fetchDayTransactions(w, startTimestamp, endTimestamp),
      ),
    );

    let feeNano = 0n;

    for (const txs of perWallet) {
      for (const tx of txs) {
        if (!tx.success) continue;
        if (tx.in_msg && tx.in_msg.value > 0) {
          feeNano += BigInt(tx.in_msg.value);
        }
      }
    }

    const feeTon = nanoToTon(feeNano);
    const dailyFeesUSD = feeTon * tonPrice;

    return {
      dailyFees: dailyFeesUSD,
      dailyUserFees: dailyFeesUSD,
      dailyRevenue: dailyFeesUSD,
      dailyHoldersRevenue: dailyFeesUSD * BUYBACK_SHARE,
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
  Fees: "All the inflows to protocol wallets is considered as fees. Fees are collected across every GroypFi product: DEX Aggregator, Trading Terminal, Cross-Chain Swap, NFT Aggregator, Token Launchpad, Perpetuals Platform and the Gbot Telegram Trading Bot.",
  UserFees:
    "Users pay a platform fee on every trade routed through any GroypFi product.",
  Revenue:
    "100% of collected fees are protocol revenue, accrued to the GroypFi house fee wallets.",
  HoldersRevenue:
    "65-80% of protocol revenue is used for $GROYP buybacks, executed from the buyback wallet UQCnkAaVs7fNpub-w3NfFVYmQtVUldPc7RZj2_CMiKoXfikn (72.5% midpoint applied).",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      fetch,
      start: "2025-11-01",
      meta: { methodology },
    },
  },
};

export default adapter;
