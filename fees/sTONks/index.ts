import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";

/**
 * sTONks — Multi-chain Launchpad, Trading Bot & Terminal
 *
 * Products:
 *   - Trading Bot (@stonks_sniper_bot): 1% per swap  → https://t.me/stonks_sniper_bot
 *   - Terminal (stonkslabs.com):        1% per swap  → https://stonkslabs.com/
 *   - sTONks.pump Launchpad:         variable fee    → https://stonkslabs.com/
 *
 * Chains: TON (primary), with EVM + Solana to be added
 *
 * Website:  https://stonks.dog/
 * App:      https://stonkslabs.com/
 *
 * ─── TON fee wallets ────────────────────────────────────────────────────────
 * Main fee wallet (raw):         0:ef7ba08b55b69a5d04dde78808f972bc891eb74ac69281ca1167d6f2b9215d6a
 * Secondary fee wallet (raw):    0:ec8f3e700f215dca0bf7ee7ae651191f0fa7818f863e78d66fa29acc9b1f486e
 * Launchpad contract A (raw):    0:783e31dc981459aa84762984a03e8d75c320435c00ac5b66b3db64b3bb371c71
 * Launchpad contract B (raw):    0:450b2f5ceb85d13f7032eff5882e20533789faec667112ddcb1c8ec1e2446624
 * Launchpad fee router (raw):    0:fccfdaaeb90c7bb38c01c11df67d48492fe0888548936d50290753c0084c1815
 * Referral payout wallet (raw):  0:1112e0d15466733671cf60bff3824b01d34b1b5bde48283937e04d18712d0148
 * Cashback payout wallet (raw):  0:040d2139ba482c511e727447588b093ec3b017e1e43b844b33eacf72615b7f1a
 */

// ─── TON addresses (raw format) ─────────────────────────────────────────────
const TON_MAIN_FEE_WALLET      = "0:ef7ba08b55b69a5d04dde78808f972bc891eb74ac69281ca1167d6f2b9215d6a";
const TON_SECONDARY_FEE        = "0:ec8f3e700f215dca0bf7ee7ae651191f0fa7818f863e78d66fa29acc9b1f486e";
const TON_LAUNCHPAD_CONTRACT_A = "0:783e31dc981459aa84762984a03e8d75c320435c00ac5b66b3db64b3bb371c71";
const TON_LAUNCHPAD_CONTRACT_B = "0:450b2f5ceb85d13f7032eff5882e20533789faec667112ddcb1c8ec1e2446624";
const TON_LAUNCHPAD_ROUTER     = "0:fccfdaaeb90c7bb38c01c11df67d48492fe0888548936d50290753c0084c1815";
const TON_REFERRAL_WALLET      = "0:1112e0d15466733671cf60bff3824b01d34b1b5bde48283937e04d18712d0148";
const TON_CASHBACK_WALLET      = "0:040d2139ba482c511e727447588b093ec3b017e1e43b844b33eacf72615b7f1a";

const TON_LAUNCHPAD_SENDERS = new Set([
  TON_LAUNCHPAD_ROUTER,
  TON_LAUNCHPAD_CONTRACT_A,
  TON_LAUNCHPAD_CONTRACT_B,
]);

const TON_PAYOUT_WALLETS = [TON_REFERRAL_WALLET, TON_CASHBACK_WALLET];
const TON_FEE_WALLETS = [TON_MAIN_FEE_WALLET, TON_SECONDARY_FEE];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

const scanTonWallet = async (
  wallet: string,
  start: number,
  end: number,
  isLaunchpad: (sender: string | undefined) => boolean = () => false
): Promise<{ tradingFees: bigint; launchpadFees: bigint }> => {
  let tradingFees = 0n;
  let launchpadFees = 0n;
  let before_lt: string | undefined;
  let before_hash: string | undefined;
  const seen = new Set<string>();

  while (true) {
    const url =
      `https://tonapi.io/v2/blockchain/accounts/${wallet}/transactions?limit=1000&sort_order=desc` +
      (before_lt && before_hash ? `&before_lt=${before_lt}&before_hash=${before_hash}` : "");

    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      throw new Error(`Failed to fetch TON transactions for ${wallet}: ${e}`);
    }

    const txs: any[] = data.transactions;
    if (!txs || !txs.length) break;

    let reachedBeforeStart = false;

    for (const tx of txs) {
      const key = tx.hash ?? `${tx.lt}:${tx.utime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (tx.utime < start) { reachedBeforeStart = true; break; }
      if (tx.utime >= end) continue;
      if (!tx.success) continue;

      const inMsg = tx.in_msg;
      if (!inMsg || inMsg.destination?.address !== wallet) continue;

      const value = toBigInt(inMsg.value);
      if (value === 0n) continue;

      const sender: string | undefined = inMsg.source?.address;
      if (isLaunchpad(sender)) {
        launchpadFees += value;
      } else {
        tradingFees += value;
      }
    }

    if (reachedBeforeStart) break;

    const lastTx = txs[txs.length - 1];
    if (lastTx?.lt == null || lastTx?.hash == null) break;

    before_lt = String(lastTx.lt);
    before_hash = String(lastTx.hash);
    await sleep(120);
  }

  return { tradingFees, launchpadFees };
};

const scanTonPayouts = async (
  wallet: string,
  start: number,
  end: number
): Promise<bigint> => {
  let total = 0n;
  let before_lt: string | undefined;
  let before_hash: string | undefined;
  const seen = new Set<string>();

  while (true) {
    const url =
      `https://tonapi.io/v2/blockchain/accounts/${wallet}/transactions?limit=1000&sort_order=desc` +
      (before_lt && before_hash ? `&before_lt=${before_lt}&before_hash=${before_hash}` : "");

    let data: any;
    try {
      data = await fetchURL(url);
    } catch (e) {
      throw new Error(`Failed to fetch TON payout transactions for ${wallet}: ${e}`);
    }

    const txs: any[] = data.transactions;
    if (!txs || !txs.length) break;

    let reachedBeforeStart = false;

    for (const tx of txs) {
      const key = tx.hash ?? `${tx.lt}:${tx.utime}`;
      if (seen.has(key)) continue;
      seen.add(key);

      if (tx.utime < start) { reachedBeforeStart = true; break; }
      if (tx.utime >= end) continue;
      if (!tx.success) continue;

      if (tx.out_msgs) {
        for (const msg of tx.out_msgs) {
          total += toBigInt(msg.value);
        }
      }
    }

    if (reachedBeforeStart) break;

    const lastTx = txs[txs.length - 1];
    if (lastTx?.lt == null || lastTx?.hash == null) break;

    before_lt = String(lastTx.lt);
    before_hash = String(lastTx.hash);
    await sleep(120);
  }

  return total;
};

// ─── Fetch ───────────────────────────────────────────────────────────────────
const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options;

  const results = await Promise.all(
    TON_FEE_WALLETS.map((w) =>
      scanTonWallet(w, start, end, (s) => TON_LAUNCHPAD_SENDERS.has(s ?? ""))
    )
  );

  let tradingFees = 0n;
  let launchpadFees = 0n;
  for (const r of results) {
    tradingFees += r.tradingFees;
    launchpadFees += r.launchpadFees;
  }
  const totalFees = tradingFees + launchpadFees;

  const payouts = await Promise.all(
    TON_PAYOUT_WALLETS.map((w) => scanTonPayouts(w, start, end))
  );
  const totalUserPayouts = payouts.reduce((a, b) => a + b, 0n);

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(totalFees.toString(), "Trading & Launchpad Fees");

  // Volume: only Bot + Terminal (1% fee); launchpad excluded (variable fee)
  const dailyVolume = options.createBalances();
  dailyVolume.addGasToken((tradingFees * 100n).toString());

  // Supply side: referral + cashback payouts to users
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addGasToken(totalUserPayouts.toString(), "Referral & Cashback Payouts");

  // Revenue = fees - payouts
  const protocolRevBigInt = totalFees > totalUserPayouts ? totalFees - totalUserPayouts : 0n;
  const dailyRevenue = options.createBalances();
  dailyRevenue.addGasToken(protocolRevBigInt.toString(), "Net Protocol Revenue");

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addGasToken(protocolRevBigInt.toString(), "Net Protocol Revenue");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

// ─── Methodology ─────────────────────────────────────────────────────────────
const methodology = {
  Volume:
    "Trading volume reverse-calculated from the 1% fee on @stonks_sniper_bot and sTONks Terminal. " +
    "sTONks.pump Launchpad volume excluded (variable fee).",
  Fees:
    "All TON inflows to fee wallets: 1% from Bot + Terminal, variable from sTONks.pump Launchpad.",
  Revenue: "Total fees minus referral and cashback payouts.",
  SupplySideRevenue: "Referral rewards and cashback payouts to users.",
  ProtocolRevenue: "Fees retained by the protocol after user payouts.",
};

const breakdownMethodology = {
  Fees: {
    "Trading & Launchpad Fees":
      "All native TON inflows to sTONks fee wallets from Bot, Terminal, and Launchpad.",
  },
  SupplySideRevenue: {
    "Referral & Cashback Payouts":
      "Native TON outflows from referral and cashback wallets to users.",
  },
  Revenue: {
    "Net Protocol Revenue": "Total fees minus referral and cashback payouts.",
  },
  ProtocolRevenue: {
    "Net Protocol Revenue": "Total fees minus user payouts, retained by the protocol.",
  },
};

// ─── Adapter ─────────────────────────────────────────────────────────────────
const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TON],
  start: "2024-01-12",
  methodology,
  breakdownMethodology,
};

export default adapter;
