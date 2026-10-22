import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";
import fetchURL from "../utils/fetchURL";

// Dexstock (https://dexstock.app) is a trading app for tokenized stocks on Robinhood Chain. It
// holds no funds and has no router of its own: each trade is filled by Uniswap (a classic swap
// sent by the trader's wallet, or a UniswapX order sent by a filler) or by Arcus RFQ (sent by
// its relayer). Nothing on chain marks a fill as Dexstock's, so Dexstock publishes which
// transactions were its trades, one entry per (tx, wallet), from its own order records:
// https://prwslspbpmguosxvnwwf.supabase.co/functions/v1/defillama-trades?from=<unix>&to=<unix>
//
// The list only says where to look; every amount comes from the chain. For each listed
// transaction the adapter reads the receipt and nets the ERC-20 transfers into and out of the
// listed wallet. A hash that failed or moved nothing for that wallet adds zero. The wallet is
// needed because one UniswapX or Arcus fill can settle several takers' orders.
//
// A trade is valued once, on the USDG leg when it has one (nearly every trade is a stock
// against USDG), otherwise on what the wallet sent. Doublecounted: the same swaps are counted
// by the Uniswap and Arcus listings.
const TRADES_API = "https://prwslspbpmguosxvnwwf.supabase.co/functions/v1/defillama-trades";
const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

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

    // Net per token for this wallet: positive is received, negative is sent.
    const net: Record<string, bigint> = {};
    for (const log of receipt.logs) {
      // Three topics is an ERC-20 Transfer; ERC-721 indexes the token id as a fourth.
      if (log.topics.length !== 3 || log.topics[0] !== TRANSFER_TOPIC) continue;
      const token = log.address.toLowerCase();
      const amount = BigInt(log.data);
      if (topicToAddress(log.topics[1]) === who) net[token] = (net[token] ?? 0n) - amount;
      if (topicToAddress(log.topics[2]) === who) net[token] = (net[token] ?? 0n) + amount;
    }

    const usdg = net[USDG];
    if (usdg !== undefined && usdg !== 0n) {
      dailyVolume.add(USDG, usdg < 0n ? -usdg : usdg);
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
  start: "2026-08-14",
  doublecounted: true,
  methodology: {
    Volume:
      "Tokenized stock trades made in Dexstock on Robinhood Chain and filled by Uniswap or Arcus. " +
      "Dexstock publishes which transactions were its trades; each one's value is read from the " +
      "ERC-20 transfers into and out of the trader's wallet in that transaction, on the USDG leg " +
      "when there is one. Doublecounted with the venues that filled the trades.",
  },
};

export default adapter;
