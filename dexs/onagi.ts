import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";
import fetchURL from "../utils/fetchURL";
import ADDRESSES from "../helpers/coreAssets.json";

// Onagi (https://onagi.si) is a trading app on Robinhood Chain. Token and stock token trades are sent
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

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-10-22",
  doublecounted: true,
  methodology: {
    Volume:
      "Token and stock token trades made in Onagi on Robinhood Chain, filled by Uniswap or the Pons bonding curve. " +
      "Onagi publishes which transactions were its trades; each one's value is read from that transaction on chain: " +
      "the Pons curve event for curve trades, otherwise the trader's USDG leg (gross of the platform fee). " +
      "Doublecounted with the venues that filled the trades.",
  },
};

export default adapter;
