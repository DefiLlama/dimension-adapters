import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchURLAutoHandleRateLimit } from "../../utils/fetchURL";
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

const TON_LAUNCHPAD_SENDERS = new Set(
  [TON_LAUNCHPAD_ROUTER, TON_LAUNCHPAD_CONTRACT_A, TON_LAUNCHPAD_CONTRACT_B].map((a) => a.toLowerCase())
);

const TON_PAYOUT_WALLETS = [TON_REFERRAL_WALLET, TON_CASHBACK_WALLET];
const TON_FEE_WALLETS = [TON_MAIN_FEE_WALLET, TON_SECONDARY_FEE];

const TRADING_FEES = "Trading Fees";
const LAUNCHPAD_FEES = "Launchpad Fees";

const PAGE = 1000;
// Unauthenticated toncenter allows ~1 request/sec
const TONCENTER_SLEEP_MS = 1500;

const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

const normAddr = (addr: string | undefined | null): string => (addr ?? "").toLowerCase();

const pageToncenterTxs = async (account: string, start: number, end: number): Promise<any[]> => {
  const all: any[] = [];
  const seen = new Set<string>();

  for (let offset = 0; ; offset += PAGE) {
    const url =
      `https://toncenter.com/api/v3/transactions?account=${account}` +
      `&start_utime=${start}&end_utime=${end}&limit=${PAGE}&offset=${offset}&sort=desc`;

    const data = await fetchURLAutoHandleRateLimit(url, 5);
    if (!Array.isArray(data?.transactions)) {
      throw new Error(`Expected a transactions array from toncenter for ${account}`);
    }

    const txs: any[] = data.transactions;
    if (!txs.length) break;

    for (const tx of txs) {
      const now = tx.now ?? tx.utime;
      const key = tx.hash ?? `${tx.lt}:${now}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (now < start || now >= end) continue;
      all.push(tx);
    }

    if (txs.length < PAGE) break;
    await sleep(TONCENTER_SLEEP_MS);
  }

  return all;
};

const scanTonWallet = async (
  wallet: string,
  start: number,
  end: number,
  isLaunchpad: (sender: string | undefined) => boolean
): Promise<{ tradingFees: bigint; launchpadFees: bigint }> => {
  let tradingFees = 0n;
  let launchpadFees = 0n;
  const walletNorm = normAddr(wallet);

  for (const tx of await pageToncenterTxs(wallet, start, end)) {
    if (tx.description?.action?.success === false) continue;

    const inMsg = tx.in_msg;
    if (!inMsg || inMsg.bounced) continue;
    if (normAddr(inMsg.destination) !== walletNorm) continue;

    const value = toBigInt(inMsg.value);
    if (value === 0n) continue;

    const sender = inMsg.source ? String(inMsg.source) : undefined;
    if (isLaunchpad(sender)) launchpadFees += value;
    else tradingFees += value;
  }

  return { tradingFees, launchpadFees };
};

const scanTonPayouts = async (wallet: string, start: number, end: number): Promise<bigint> => {
  let total = 0n;

  for (const tx of await pageToncenterTxs(wallet, start, end)) {
    if (tx.description?.action?.success === false) continue;
    if (!tx.out_msgs) continue;
    for (const msg of tx.out_msgs) {
      if (msg.bounced) continue;
      total += toBigInt(msg.value);
    }
  }

  return total;
};

// ─── Fetch ───────────────────────────────────────────────────────────────────
const fetch = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options;

  let tradingFees = 0n;
  let launchpadFees = 0n;
  for (const w of TON_FEE_WALLETS) {
    const r = await scanTonWallet(w, start, end, (s) => TON_LAUNCHPAD_SENDERS.has(normAddr(s)));
    tradingFees += r.tradingFees;
    launchpadFees += r.launchpadFees;
    await sleep(TONCENTER_SLEEP_MS);
  }
  const totalFees = tradingFees + launchpadFees;

  let totalUserPayouts = 0n;
  for (const w of TON_PAYOUT_WALLETS) {
    totalUserPayouts += await scanTonPayouts(w, start, end);
    await sleep(TONCENTER_SLEEP_MS);
  }

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(tradingFees.toString(), TRADING_FEES);
  dailyFees.addGasToken(launchpadFees.toString(), LAUNCHPAD_FEES);

  // Volume: only Bot + Terminal (1% fee); launchpad excluded (variable fee)
  const dailyVolume = options.createBalances();
  dailyVolume.addGasToken((tradingFees * 100n).toString());

  // Supply side: referral + cashback payouts to users
  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addGasToken(totalUserPayouts.toString(), "Referral & Cashback Payouts");

  // Revenue = fees - payouts; can go negative on days payouts exceed fees, which is real
  // (referral/cashback payouts settle on their own schedule, not 1:1 with the fees that funded them)
  const protocolRevBigInt = totalFees - totalUserPayouts;
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
    [TRADING_FEES]:
      "1% native TON fees from @stonks_sniper_bot and sTONks Terminal inflows to fee wallets.",
    [LAUNCHPAD_FEES]:
      "Variable native TON fees from sTONks.pump Launchpad routed to fee wallets.",
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
  // unauthenticated toncenter allows ~1 request/sec; hourly runs would multiply
  // requests 24x/day across 4 wallets and hit that limit
  pullHourly: false,
  fetch,
  chains: [CHAIN.TON],
  start: "2024-01-12",
  methodology,
  breakdownMethodology,
  // Net Protocol Revenue can legitimately go negative on days referral/cashback
  // payouts exceed inbound fees
  allowNegativeValue: true,
};

export default adapter;
