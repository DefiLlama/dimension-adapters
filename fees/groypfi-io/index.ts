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
 * A share of collected revenue is used for $GROYP buybacks, executed from
 * the buyback wallet UQCnkAaVs7fNpub-w3NfFVYmQtVUldPc7RZj2_CMiKoXfikn.
 * Holders revenue is derived from the buybacks actually observed on-chain in
 * the reporting window, never from a budget target.
 *
 * Website: https://groypfi.io
 * Twitter: https://x.com/groypfi
 * Contact: zeuraph7@gmail.com
 */

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";
import PromisePool from "@supercharge/promise-pool";

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

// $GROYP buyback wallet — TON sent from the fee wallets to this address is the
// budget actually spent on buybacks (= holders revenue) in the window.
const BUYBACK_WALLET =
  "0:a7900695b3b7cda6e6fec3735f15562642d55495d3dced1663dbf08c88aa177e";

const TON_API = "https://tonapi.io/v2";

// TonAPI public tier allows ~1 request / 4s without authorization.
const REQUEST_INTERVAL_MS = 4_100;
let nextSlot = 0;

async function rateLimitedGet<T>(url: string): Promise<T> {
  const now = Date.now();
  const runAt = Math.max(now, nextSlot);
  nextSlot = runAt + REQUEST_INTERVAL_MS;
  const wait = runAt - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  return httpGet(url);
}

interface TonMessage {
  value?: number | string;
  msg_type?: string;
  source?: { address: string };
  destination?: { address: string };
}

interface TonTransaction {
  hash: string;
  lt: string;
  utime: number;
  success: boolean;
  in_msg?: TonMessage;
  out_msgs?: TonMessage[];
}

interface TxPage {
  transactions: TonTransaction[];
}

function normalize(addr?: string): string {
  return (addr ?? "").toLowerCase();
}

const BUYBACK_WALLET_LC = normalize(BUYBACK_WALLET);

async function fetchWindowTransactions(
  account: string,
  startTs: number,
  endTs: number,
): Promise<TonTransaction[]> {
  const collected: TonTransaction[] = [];
  let beforeLt: string | undefined;
  const limit = 256;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let url = `${TON_API}/blockchain/accounts/${account}/transactions?limit=${limit}&sort_order=desc&start_date=${startTs}&end_date=${endTs}`;
    if (beforeLt) url += `&before_lt=${beforeLt}`;

    const page: TxPage = await rateLimitedGet(url);
    const txs = page.transactions ?? [];
    if (txs.length === 0) break;

    for (const tx of txs) {
      if (tx.utime < startTs) return collected;
      if (tx.utime < endTs && tx.utime >= startTs) collected.push(tx);
    }

    beforeLt = txs[txs.length - 1].lt;
    if (txs.length < limit) break;
  }

  return collected;
}

const fetch = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances } = options;

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailyProtocolRevenue = createBalances();
  const dailyHoldersRevenue = createBalances();

  // Sequential, rate-limited collection. Any failure propagates so the day is
  // retried instead of being published as zero fees.
  const { results, errors } = await PromisePool.withConcurrency(1)
    .for(FEE_WALLETS)
    .process((wallet: string) =>
      fetchWindowTransactions(wallet, startTimestamp, endTimestamp),
    );

  if (errors.length)
    throw new Error(`groypfi: TonAPI transaction fetch failed: ${errors[0]}`);

  let feeNano = 0n;
  let buybackNano = 0n;

  for (const txs of results) {
    for (const tx of txs) {
      if (!tx.success) continue;

      // Inflows to the house wallets = platform fees collected.
      if (tx.in_msg && Number(tx.in_msg.value) > 0) {
        const from = normalize(tx.in_msg.source?.address);
        // Ignore internal transfers between our own wallets (no new fee).
        if (!FEE_WALLETS.some((w) => normalize(w) === from)) {
          feeNano += BigInt(tx.in_msg.value ?? 0);
        }
      }

      // Outflows to the buyback wallet = $GROYP buybacks executed that day.
      for (const out of tx.out_msgs ?? []) {
        if (normalize(out.destination?.address) !== BUYBACK_WALLET_LC) continue;
        if (Number(out.value) > 0) buybackNano += BigInt(out.value ?? 0);
      }
    }
  }

  dailyFees.addGasToken(feeNano, "Platform fees collected at house wallets");
  dailyRevenue.addGasToken(feeNano, "Protocol revenue accrued to house wallets");
  dailyHoldersRevenue.addGasToken(buybackNano, "$GROYP buybacks executed");

  const retained = feeNano > buybackNano ? feeNano - buybackNano : 0n;
  dailyProtocolRevenue.addGasToken(retained, "Revenue retained by the protocol");

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "All inflows to the GroypFi house fee wallets are counted as fees. Fees are collected across every GroypFi product: DEX Aggregator, Trading Terminal, Cross-Chain Swap, NFT Aggregator, Token Launchpad, Perpetuals Platform and the Gbot Telegram Trading Bot. Transfers between the house wallets themselves are excluded.",
  UserFees:
    "Users pay a platform fee on every trade routed through any GroypFi product.",
  Revenue:
    "100% of collected fees are protocol revenue, accrued to the GroypFi house fee wallets.",
  ProtocolRevenue:
    "Revenue retained by the protocol: fees collected minus the TON actually sent to the $GROYP buyback wallet in the same window.",
  HoldersRevenue:
    "TON actually transferred from the house fee wallets to the $GROYP buyback wallet UQCnkAaVs7fNpub-w3NfFVYmQtVUldPc7RZj2_CMiKoXfikn during the window and used to buy back $GROYP. A subset of Revenue; buybacks may land on a different day than the fees that funded them.",
};

const breakdownMethodology = {
  Fees: {
    "Platform fees collected at house wallets":
      "Sum of successful TON inflows to the four GroypFi house fee wallets, excluding transfers between those wallets.",
  },
  UserFees: {
    "Platform fees collected at house wallets":
      "Same inflows, all of which are paid by users on their trades.",
  },
  Revenue: {
    "Protocol revenue accrued to house wallets":
      "100% of the collected platform fees.",
  },
  ProtocolRevenue: {
    "Revenue retained by the protocol":
      "Collected fees minus the TON sent to the $GROYP buyback wallet in the window.",
  },
  HoldersRevenue: {
    "$GROYP buybacks executed":
      "TON sent from the house fee wallets to the $GROYP buyback wallet in the window.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.TON],
  start: "2025-11-01",
  pullHourly: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
