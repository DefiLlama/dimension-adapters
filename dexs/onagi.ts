import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";
import fetchURL from "../utils/fetchURL";
import ADDRESSES from "../helpers/coreAssets.json";
import { getSignaturesForAddress, getTransaction } from "../helpers/solana";
import { PromisePool } from "@supercharge/promise-pool";

// Onagi (https://onagi.si) is a trading app on Robinhood Chain and Solana. Token and stock token trades are sent
// by each user's own wallet and filled by Uniswap (v2/v3/v4 through the Universal Router) or by the
// Pons bonding curve. Onagi has no router of its own, and not every trade leaves an Onagi mark on chain:
// ONAGI itself pays no platform fee on its Pons route, and curve tokens pay the fee in a separate
// transaction. So Onagi publishes which transactions were its trades, one entry per (tx, wallet),
// from its own trade records:
// https://onagi.si/api/credit/defillama/trades?from=<unix>&to=<unix>
//
// The list only says where to look; every amount comes from the chain. For each listed transaction:
// - a Pons curve trade is valued in ETH from the curve's own event (quoteIn on a buy, quoteOut plus
//   fee and tax on a sell);
// - otherwise the trade is valued on the wallet's USDG leg: what it paid on a buy, or what it received
//   plus the platform fee the swap sent to the Onagi fee vault on a sell (volume is gross of fees);
// - a trade with neither is valued on the tokens the wallet sent.
// A failed transaction, or one that moved nothing for that wallet, adds zero.
// Doublecounted: the same swaps are counted by the Uniswap and Pons listings.
const TRADES_API = "https://onagi.si/api/credit/defillama/trades";
const USDG = ADDRESSES.robinhood.USDG;
// Onagi fee vault, the same contract fees/onagi.ts reads (https://onagi.si/onagi lists it).
const FEE_VAULT = "0xe2f197ba0d1c0864b86fa36186c0c80b57f54f49";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Pons V2 bonding curve events (https://docs.ponsfamily.com/v2, "Events to index"); quote is native ETH.
const curve = new Interface([
  "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)",
  "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax)",
]);
const CURVE_BUY_TOPIC = curve.getEvent("CurveBuy")!.topicHash;
const CURVE_SELL_TOPIC = curve.getEvent("CurveSell")!.topicHash;

const topicToAddress = (topic: string) => ("0x" + topic.slice(26)).toLowerCase();

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { trades } = await fetchURL(`${TRADES_API}?from=${options.startTimestamp}&to=${options.endTimestamp}`);
  if (!trades.length) return { dailyVolume };

  const hashes: string[] = [...new Set<string>(trades.map((t: any) => t.tx.toLowerCase()))];
  const receipts = await getTxReceiptsWithRetry(options.chain, hashes);
  const receiptByHash: Record<string, any> = {};
  hashes.forEach((hash, i) => {
    if (!receipts[i]) throw new Error(`Missing receipt for ${hash}`);
    receiptByHash[hash] = receipts[i];
  });

  for (const { tx, wallet } of trades) {
    const receipt = receiptByHash[tx.toLowerCase()];
    if (Number(receipt.status) !== 1) continue;
    const who = wallet.toLowerCase();

    // Pons curve trade by this wallet: ETH in or out of the curve.
    const curveLog = receipt.logs.find((log: any) =>
      (log.topics[0] === CURVE_BUY_TOPIC || log.topics[0] === CURVE_SELL_TOPIC) && topicToAddress(log.topics[1]) === who);
    if (curveLog) {
      const event = curve.parseLog(curveLog)!;
      if (event.name === "CurveBuy") dailyVolume.addGasToken(event.args.quoteIn);
      else dailyVolume.addGasToken(event.args.quoteOut + event.args.fee + event.args.tax);
      continue;
    }

    // Net per token for this wallet: positive is received, negative is sent.
    const net: Record<string, bigint> = {};
    let feeToVault = 0n;
    for (const log of receipt.logs) {
      // Three topics is an ERC-20 Transfer; ERC-721 indexes the token id as a fourth.
      if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
      const token = log.address.toLowerCase();
      const from = topicToAddress(log.topics[1]);
      const to = topicToAddress(log.topics[2]);
      const amount = BigInt(log.data);
      if (from === who) net[token] = (net[token] ?? 0n) - amount;
      if (to === who) net[token] = (net[token] ?? 0n) + amount;
      // the platform fee the swap itself sent to the vault (on a buy the wallet pays it, already in its leg)
      if (token === USDG.toLowerCase() && to === FEE_VAULT && from !== who) feeToVault += amount;
    }

    const usdg = net[USDG.toLowerCase()];
    if (usdg !== undefined && usdg !== 0n) {
      dailyVolume.add(USDG, usdg < 0n ? -usdg : usdg + feeToVault);
      continue;
    }
    for (const [token, amount] of Object.entries(net)) {
      if (amount < 0n) dailyVolume.add(token, -amount);
    }
  }

  return { dailyVolume };
};

// SOLANA. Token trades are Jupiter swaps signed by each user's own Solana wallet, always between USDC and the token.
// Every one pays Onagi's platform fee inside the swap, through Jupiter's platform fee, in USDC, into one Onagi fee
// account; Jupiter is never asked for a quote without it. So the fee account's own history lists every Onagi
// trade, and no list from Onagi is needed. For each successful transaction of that account that runs Jupiter:
// - the fee is what the fee account received in it;
// - the volume is the trader's USDC leg (the fee payer is the trader): what it paid on a buy, or what it received
//   plus the fee on a sell, so volume is gross of the fee like on Robinhood Chain.
// Withdrawals from the fee account receive nothing and add zero.
const SOLANA_USDC = ADDRESSES.solana.USDC;
// Owner of the fee account and its USDC token account, the feeAccount of every Onagi Jupiter swap.
const SOLANA_FEE_OWNER = "DEnNbkQgpUiHxyjSzSTdNxBPg6JC5iZ92DtAkys9mwpD";
const SOLANA_FEE_ACCOUNT = "Gu6dzYEGMpvfjUng5p6erjPJqirEdBE6sMHsZmA2zc9i";
const JUPITER_V6 = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

// The fee account's signatures, newest first, paged once per run and shared by every hourly window. A signature
// whose blockTime the node left out is kept: its time is read from the transaction itself.
const solanaHistory: any[] = [];
let solanaHistoryEnd = false;
let solanaPaging: Promise<void> = Promise.resolve();
const solanaSignatures = async (from: number, to: number) => {
  const oldest = () => [...solanaHistory].reverse().find((entry) => typeof entry.blockTime === "number")?.blockTime;
  solanaPaging = solanaPaging.catch(() => undefined).then(async () => {
    while (!solanaHistoryEnd && !((oldest() ?? Infinity) < from)) {
      const before = solanaHistory[solanaHistory.length - 1]?.signature;
      const page = await getSignaturesForAddress({ address: SOLANA_FEE_ACCOUNT, limit: 1000, before });
      solanaHistory.push(...(page ?? []));
      if (!page?.length || page.length < 1000) solanaHistoryEnd = true;
    }
  });
  await solanaPaging;
  return solanaHistory
    .filter((entry) => !entry.err && (typeof entry.blockTime !== "number" || (entry.blockTime >= from && entry.blockTime < to)))
    .map((entry) => entry.signature as string);
};

// USDC base units an owner gained (negative: lost) in a transaction, over all of its USDC token accounts.
const usdcDelta = (meta: any, owner: string) => {
  let delta = 0n;
  for (const [list, sign] of [[meta.preTokenBalances, -1n], [meta.postTokenBalances, 1n]] as const) {
    for (const b of list ?? []) {
      if (b.mint === SOLANA_USDC && b.owner === owner) delta += sign * BigInt(b.uiTokenAmount.amount);
    }
  }
  return delta;
};

const solanaTransaction = async (signature: string) => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await getTransaction({ signature, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 });
    } catch (e: any) {
      if (attempt >= 6 || !String(e?.message ?? e).includes("429")) throw e;
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt));
    }
  }
};

// Every Onagi trade on Solana in the window: the platform fee and the gross volume, in USDC base units.
export async function getOnagiSolanaTrades(options: FetchOptions) {
  const from = options.startTimestamp, to = options.endTimestamp;
  const signatures = await solanaSignatures(from, to);
  // A few at a time, waiting and retrying on 429: public Solana RPC rate limits getTransaction.
  const { results: trades, errors } = await PromisePool.withConcurrency(3).for(signatures).process(async (signature) => {
    const tx = await solanaTransaction(signature);
    // A missing transaction means the node could not serve it, not that nothing traded.
    if (!tx?.meta) throw new Error(`onagi: solana rpc returned no transaction for ${signature}`);
    if (typeof tx.blockTime !== "number") throw new Error(`onagi: solana rpc returned no block time for ${signature}`);
    if (tx.blockTime < from || tx.blockTime >= to) return null;
    if (tx.meta.err || !(tx.meta.logMessages ?? []).some((log: string) => log.startsWith(`Program ${JUPITER_V6} invoke`))) return null;
    const fee = usdcDelta(tx.meta, SOLANA_FEE_OWNER);
    if (fee <= 0n) return null;
    const trader = tx.transaction.message.accountKeys[0].pubkey;
    const leg = usdcDelta(tx.meta, trader);
    return { fee, volume: leg < 0n ? -leg : leg + fee };
  });
  if (errors.length) throw errors[0];
  return trades.filter((t): t is { fee: bigint; volume: bigint } => t !== null);
}

const fetchSolana = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  for (const { volume } of await getOnagiSolanaTrades(options)) dailyVolume.add(SOLANA_USDC, volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-10-22" },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-10-25" },
  },
  doublecounted: true,
  methodology: {
    Volume:
      "Token and stock token trades made in Onagi. On Robinhood Chain they are filled by Uniswap or the Pons bonding curve: " +
      "Onagi publishes which transactions were its trades; each one's value is read from that transaction on chain: " +
      "the Pons curve event for curve trades, otherwise the trader's USDG leg (gross of the platform fee). " +
      "On Solana they are Jupiter swaps that all pay Onagi's platform fee into one fee account; every Jupiter transaction " +
      "of that account is an Onagi trade, valued on the trader's USDC leg (gross of the fee). " +
      "Doublecounted with the venues that filled the trades.",
  },
};

export default adapter;
