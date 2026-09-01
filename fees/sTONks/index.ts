import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { sleep } from "../../utils/utils";
import { getEnv } from "../../helpers/env";

/**
 * sTONks — Multi-chain Launchpad, Trading Bot & Terminal
 *
 * Products:
 *   - Trading Bot (@stonks_sniper_bot): 1% per swap  → https://t.me/stonks_sniper_bot
 *   - Terminal (stonkslabs.com):        1% per swap  → https://stonkslabs.com/
 *   - sTONks.pump Launchpad:         variable fee    → https://stonkslabs.com/
 *
 * Chains: TON, Ethereum, BSC, Solana
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
 *
 * ─── EVM fee wallets ────────────────────────────────────────────────────────
 * Bot + Terminal fee (ETH/BSC):  0xeed3b4867b27a876c5bd8ce22aff210486b7b433
 * Secondary fee (ETH/BSC):      0x2f521187c6cc1d9db701d784de5b2f5046f32a1d
 * Launchpad fee (ETH/BSC):      0xd3561fa0fa1a4f3e2a008134ea01cc805d323304
 * Referral payout (ETH/BSC):    0x552a41f0d9e74897f8d087d4c6e729abfc6c9bf1
 *
 * ─── Solana fee wallets ─────────────────────────────────────────────────────
 * Bot + Terminal fee (SOL):      jf18AWK78fEEhk7N3aMr1A9JtesgraGxuJzjUrNJfee
 */

// ─── TON addresses (raw format) ─────────────────────────────────────────────
const TON_MAIN_FEE_WALLET    = "0:ef7ba08b55b69a5d04dde78808f972bc891eb74ac69281ca1167d6f2b9215d6a";
const TON_SECONDARY_FEE      = "0:ec8f3e700f215dca0bf7ee7ae651191f0fa7818f863e78d66fa29acc9b1f486e";
const TON_LAUNCHPAD_CONTRACT_A = "0:783e31dc981459aa84762984a03e8d75c320435c00ac5b66b3db64b3bb371c71";
const TON_LAUNCHPAD_CONTRACT_B = "0:450b2f5ceb85d13f7032eff5882e20533789faec667112ddcb1c8ec1e2446624";
const TON_LAUNCHPAD_ROUTER   = "0:fccfdaaeb90c7bb38c01c11df67d48492fe0888548936d50290753c0084c1815";
const TON_REFERRAL_WALLET    = "0:1112e0d15466733671cf60bff3824b01d34b1b5bde48283937e04d18712d0148";
const TON_CASHBACK_WALLET    = "0:040d2139ba482c511e727447588b093ec3b017e1e43b844b33eacf72615b7f1a";

// Set of all launchpad-related senders on TON (variable fee → no volume calc)
const TON_LAUNCHPAD_SENDERS = new Set([
  TON_LAUNCHPAD_ROUTER,
  TON_LAUNCHPAD_CONTRACT_A,
  TON_LAUNCHPAD_CONTRACT_B,
]);

// Wallets that pay OUT to users (referrals + cashback) — tracked as userFees
const TON_PAYOUT_WALLETS = [TON_REFERRAL_WALLET, TON_CASHBACK_WALLET];

// All TON fee collection wallets to scan for inflows
const TON_FEE_WALLETS = [TON_MAIN_FEE_WALLET, TON_SECONDARY_FEE];

// ─── EVM addresses ───────────────────────────────────────────────────────────
const EVM_TRADING_FEE    = "0xeed3b4867b27a876c5bd8ce22aff210486b7b433";
const EVM_SECONDARY_FEE  = "0x2f521187c6cc1d9db701d784de5b2f5046f32a1d";
const EVM_LAUNCHPAD_FEE  = "0xd3561fa0fa1a4f3e2a008134ea01cc805d323304";
const EVM_REFERRAL       = "0x552a41f0d9e74897f8d087d4c6e729abfc6c9bf1";

// ─── Solana addresses ────────────────────────────────────────────────────────
const SOL_TRADING_FEE = "jf18AWK78fEEhk7N3aMr1A9JtesgraGxuJzjUrNJfee";

// ─── Helpers ─────────────────────────────────────────────────────────────────
const toBigInt = (v: any): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(Math.trunc(v));
  return 0n;
};

/**
 * Generic TON wallet scanner.
 * Returns total inflow to `wallet` within [start, end).
 * `isLaunchpad`: callback to classify sender as launchpad (variable fee).
 */
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

/**
 * Scans a TON payout wallet for outflows within [start, end).
 * Outflows = value paid out to users (referrals / cashback).
 */
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

      // Sum all outgoing messages (value sent to users)
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

// ─── TON fetch ───────────────────────────────────────────────────────────────
const fetchTON = async (options: FetchOptions) => {
  const { startTimestamp: start, endTimestamp: end } = options;

  // Scan all fee inflow wallets in parallel
  const [mainResult, secondaryResult] = await Promise.all([
    scanTonWallet(TON_MAIN_FEE_WALLET, start, end, (s) => TON_LAUNCHPAD_SENDERS.has(s ?? "")),
    scanTonWallet(TON_SECONDARY_FEE,   start, end, (s) => TON_LAUNCHPAD_SENDERS.has(s ?? "")),
  ]);

  const tradingFees  = mainResult.tradingFees  + secondaryResult.tradingFees;
  const launchpadFees = mainResult.launchpadFees + secondaryResult.launchpadFees;
  const totalFees = tradingFees + launchpadFees;

  // Scan payout wallets in parallel
  const [referralPayouts, cashbackPayouts] = await Promise.all(
    TON_PAYOUT_WALLETS.map((w) => scanTonPayouts(w, start, end))
  );
  const totalUserPayouts = referralPayouts + cashbackPayouts;

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(totalFees.toString());

  // Volume: only Bot + Terminal (1% fee); launchpad excluded (variable fee)
  const dailyVolume = options.createBalances();
  dailyVolume.addGasToken((tradingFees * 100n).toString());

  // User payouts (referrals + cashback) — value returned to users
  const dailyUserFees = options.createBalances();
  dailyUserFees.addGasToken(totalUserPayouts.toString());

  // Protocol revenue = total fees collected − what was paid back to users
  const protocolRevenueBigInt = totalFees > totalUserPayouts
    ? totalFees - totalUserPayouts
    : 0n;
  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addGasToken(protocolRevenueBigInt.toString());

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyUserFees,
    dailyProtocolRevenue,
  };
};

// ─── EVM fetch (ETH / BSC) ───────────────────────────────────────────────────
const fetchEVM = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances, chain } = options;

  // Use Etherscan-compatible API
  const baseUrl = chain === CHAIN.BSC
    ? "https://api.bscscan.com/api"
    : "https://api.etherscan.io/api";

  const apiKey = chain === CHAIN.BSC
    ? getEnv("BSCSCAN_API_KEY")
    : getEnv("ETHERSCAN_API_KEY");

  const fetchWalletInflows = async (address: string): Promise<number> => {
    const url = `${baseUrl}?module=account&action=txlist&address=${address}` +
      `&startblock=0&endblock=99999999&sort=asc&apikey=${apiKey}`;
    const data = await fetchURL(url);
    if (data.status !== "1") return 0;

    return (data.result as any[])
      .filter((tx: any) =>
        tx.to?.toLowerCase() === address.toLowerCase() &&
        Number(tx.timeStamp) >= startTimestamp &&
        Number(tx.timeStamp) < endTimestamp &&
        tx.isError === "0"
      )
      .reduce((sum: number, tx: any) => sum + Number(tx.value) / 1e18, 0);
  };

  const fetchWalletOutflows = async (address: string): Promise<number> => {
    const url = `${baseUrl}?module=account&action=txlist&address=${address}` +
      `&startblock=0&endblock=99999999&sort=asc&apikey=${apiKey}`;
    const data = await fetchURL(url);
    if (data.status !== "1") return 0;

    return (data.result as any[])
      .filter((tx: any) =>
        tx.from?.toLowerCase() === address.toLowerCase() &&
        Number(tx.timeStamp) >= startTimestamp &&
        Number(tx.timeStamp) < endTimestamp &&
        tx.isError === "0"
      )
      .reduce((sum: number, tx: any) => sum + Number(tx.value) / 1e18, 0);
  };

  const [tradingFees, secondaryFees, launchpadFees, referralPayouts] = await Promise.all([
    fetchWalletInflows(EVM_TRADING_FEE),
    fetchWalletInflows(EVM_SECONDARY_FEE),
    fetchWalletInflows(EVM_LAUNCHPAD_FEE),
    fetchWalletOutflows(EVM_REFERRAL),
  ]);

  const totalTradingFees  = tradingFees + secondaryFees;
  const totalFees         = totalTradingFees + launchpadFees;

  const dailyFees = createBalances();
  dailyFees.addGasToken(String(Math.round(totalFees * 1e18)));

  const dailyVolume = createBalances();
  dailyVolume.addGasToken(String(Math.round(totalTradingFees * 100 * 1e18)));

  const dailyUserFees = createBalances();
  dailyUserFees.addGasToken(String(Math.round(referralPayouts * 1e18)));

  const protocolRev = Math.max(0, totalFees - referralPayouts);
  const dailyProtocolRevenue = createBalances();
  dailyProtocolRevenue.addGasToken(String(Math.round(protocolRev * 1e18)));

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyUserFees,
    dailyProtocolRevenue,
  };
};

// ─── Solana fetch ─────────────────────────────────────────────────────────────
const fetchSolana = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp, createBalances } = options;

  let tradingFees = 0;
  let lastSignature: string | undefined;
  let reachedBeforeStart = false;

  while (!reachedBeforeStart) {
    const url = `https://api.mainnet-beta.solana.com`;
    const body = {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [
        SOL_TRADING_FEE,
        { limit: 1000, ...(lastSignature ? { before: lastSignature } : {}) },
      ],
    };

    let sigData: any;
    try {
      sigData = await fetchURL(url, { method: "POST", body: JSON.stringify(body) });
    } catch (e) {
      throw new Error(`Failed to fetch Solana signatures: ${e}`);
    }

    const sigs: any[] = sigData.result ?? [];
    if (!sigs.length) break;

    for (const sig of sigs) {
      const blockTime = sig.blockTime ?? 0;
      if (blockTime < startTimestamp) { reachedBeforeStart = true; break; }
      if (blockTime >= endTimestamp) continue;
      if (sig.err) continue;

      // Fetch transaction detail to get SOL transfer value
      const txBody = {
        jsonrpc: "2.0",
        id: 1,
        method: "getTransaction",
        params: [sig.signature, { encoding: "json", maxSupportedTransactionVersion: 0 }],
      };
      try {
        const txData = await fetchURL(url, { method: "POST", body: JSON.stringify(txBody) });
        const tx = txData.result;
        if (!tx) continue;

        const accountKeys: string[] = tx.transaction?.message?.accountKeys ?? [];
        const feeWalletIndex = accountKeys.indexOf(SOL_TRADING_FEE);
        if (feeWalletIndex < 0) continue;

        const preBalance  = tx.meta?.preBalances?.[feeWalletIndex]  ?? 0;
        const postBalance = tx.meta?.postBalances?.[feeWalletIndex] ?? 0;
        const delta = postBalance - preBalance;
        if (delta > 0) tradingFees += delta / 1e9; // lamports → SOL
      } catch (_) { continue; }

      await sleep(50);
    }

    lastSignature = sigs[sigs.length - 1]?.signature;
    if (!lastSignature) break;
    await sleep(200);
  }

  const dailyFees = createBalances();
  dailyFees.addGasToken(String(Math.round(tradingFees * 1e9)));

  const dailyVolume = createBalances();
  dailyVolume.addGasToken(String(Math.round(tradingFees * 100 * 1e9)));

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

// ─── Methodology ─────────────────────────────────────────────────────────────
const methodology = {
  Volume:
    "Trading volume reverse-calculated from the 1% fee collected from @stonks_sniper_bot (Telegram trading bot) " +
    "and the sTONks Terminal (stonkslabs.com) across TON, Ethereum, BSC and Solana. " +
    "sTONks.pump Launchpad volume is excluded due to variable fee rates.",
  Fees:
    "All inflows to fee wallets across TON, Ethereum, BSC and Solana: " +
    "1% from Trading Bot and Terminal, plus variable fees from sTONks.pump Launchpad.",
  Revenue:
    "Total fee inflows across all chains.",
  UserFees:
    "Value paid out to users via referral rewards and cashback programs on TON and EVM chains.",
  ProtocolRevenue:
    "Total fees collected minus referral and cashback payouts to users.",
};

// ─── Adapter ─────────────────────────────────────────────────────────────────
const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  chains: [CHAIN.TON, CHAIN.ETHEREUM, CHAIN.BSC, CHAIN.SOLANA],
  fetch: async (options: FetchOptions) => {
    switch (options.chain) {
      case CHAIN.TON:      return fetchTON(options);
      case CHAIN.ETHEREUM: return fetchEVM(options);
      case CHAIN.BSC:      return fetchEVM(options);
      case CHAIN.SOLANA:   return fetchSolana(options);
      default: return {};
    }
  },
  start: "2024-01-12",
};

export default adapter;
