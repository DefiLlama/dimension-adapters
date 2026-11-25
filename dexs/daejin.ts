import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTransactionsWithRetry } from "../helpers/getTxReceipts";
import ADDRESSES from "../helpers/coreAssets.json";
import { base58Decode, base58Encode, getAccountBuffers, getSignaturesForAddress, getTransaction } from "../helpers/solana";

// Daejin runs two kinds of prediction market on each chain:
//  - AMM markets (PredictionMarket): every bet emits BetPlaced with the cash paid and the token.
//  - Order-book markets (ClobExchange): the matching engine's bridge settles each fill on-chain
//    with settleFill (two signed orders) or ammFill (one order against the AMM pool).
//
// Deployments (https://daejin.xyz). PredictionMarket and ClobExchange are ERC-1967 (UUPS)
// proxies; the events and views used here are on the implementation each proxy points to.
//  Ethereum
//   PredictionMarket https://etherscan.io/address/0xA528f636bAE87FF2c3e4d5718313cfC38C1B0be9
//   ClobExchange     https://etherscan.io/address/0x9b00A64FF4a8F72D6Ff463fFe3acBC01cf5DB24f
//   collateral       Circle USDC, 6 decimals
//                    https://etherscan.io/token/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48
//  BNB Chain
//   PredictionMarket https://bscscan.com/address/0x7B8F913097242e21895F3731206F07d753170c07
//   ClobExchange     https://bscscan.com/address/0x792a699e6A35566Ae293AD560698C41917B27b02
//   collateral       Binance-Peg USDC, 18 decimals
//                    https://bscscan.com/token/0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
// The collateral is the paymentToken of every order-book market created so far on each chain
// (ClobExchange.markets(id).paymentToken); the AMM path takes the token from the event itself.
const CONTRACTS: Record<string, { predictionMarket: string; clobExchange: string; collateral: string }> = {
  [CHAIN.ETHEREUM]: {
    predictionMarket: "0xA528f636bAE87FF2c3e4d5718313cfC38C1B0be9",
    clobExchange: "0x9b00A64FF4a8F72D6Ff463fFe3acBC01cf5DB24f",
    collateral: ADDRESSES.ethereum.USDC,
  },
  [CHAIN.BSC]: {
    predictionMarket: "0x7B8F913097242e21895F3731206F07d753170c07",
    clobExchange: "0x792a699e6A35566Ae293AD560698C41917B27b02",
    collateral: ADDRESSES.bsc.USDC,
  },
};

// cashAmount is the gross stake in the bet token's raw units; token 0x0 is the chain's native coin
const BET_PLACED =
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, address token, uint256 cashAmount, uint256 sharesReceived, uint256 priceNum, uint256 priceDen)";
const NATIVE = ADDRESSES.null;

// One event per fill. size is the signed order's size in 6-decimal share units; the exchange
// converts that to collateral units with the market's shareUnit (10^(decimals-6), 1 where the
// collateral has 6 decimals or the market predates the field), so cash = legCash * shareUnit.
// execPrice is the YES price in ticks out of PRICE_TICKS. The outcome each side traded is not
// in the event, so it is read from the settlement call's calldata below.
// PRICE_TICKS is the exchange's public constant: ClobExchange.PRICE_TICKS() returns 1000 on
// both chains (price 1000 = 1 collateral unit per share), and the contract charges a leg
// price * size / PRICE_TICKS, which legCash mirrors.
const FILL_SETTLED =
  "event FillSettled(uint256 indexed marketId, bytes32 hashA, bytes32 hashB, uint256 execPrice, uint256 size, uint256 totalFee)";
const AMM_FILLED =
  "event AmmFilled(uint256 indexed marketId, bytes32 hash, uint256 execPrice, uint256 size, uint256 fee)";
const PRICE_TICKS = 1000n;
const ORDER = "(address user, uint256 market, uint8 action, uint8 outcome, uint256 price, uint256 size, uint256 salt, uint256 expiry)";
const clobIface = new Interface([
  `function settleFill(${ORDER} orderA, bytes sigA, ${ORDER} orderB, bytes sigB, uint256 execPrice, uint256 size)`,
  `function ammFill(${ORDER} order, bytes sig, uint256 execPrice, uint256 size)`,
]);
const OUTCOME_YES = 0n;
const SHARE_UNIT_ABI = "function shareUnit(uint256) view returns (uint256)";

// Collateral one side pays (or receives) for `size` shares of `outcome` at execPrice.
const legCash = (outcome: bigint, execPrice: bigint, size: bigint): bigint => {
  const px = outcome === OUTCOME_YES ? execPrice : PRICE_TICKS - execPrice;
  return (px * size) / PRICE_TICKS;
};

const fetchEvm = async (options: FetchOptions) => {
  const { predictionMarket, clobExchange, collateral } = CONTRACTS[options.chain];
  const dailyVolume = options.createBalances();

  const bets = await options.getLogs({ target: predictionMarket, eventAbi: BET_PLACED });
  for (const bet of bets) {
    if (bet.token.toLowerCase() === NATIVE) dailyVolume.addGasToken(bet.cashAmount);
    else dailyVolume.add(bet.token, bet.cashAmount);
  }

  const fills = [
    ...(await options.getLogs({ target: clobExchange, eventAbi: FILL_SETTLED, entireLog: true })),
    ...(await options.getLogs({ target: clobExchange, eventAbi: AMM_FILLED, entireLog: true })),
  ];
  if (!fills.length) return { dailyVolume };

  // One settlement per transaction, a few thousand on a busy day. Fetched in small batches
  // with a second pass over stragglers: the helper re-requests hashes a lagging node answers
  // null, but public nodes answer null under load faster than its three quick attempts
  // recover, and a day with one hash short is a day that cannot be stored.
  const txHashes = [...new Set(fills.map((log: any) => log.transactionHash.toLowerCase()))];
  const calldataByHash = new Map<string, string>();
  const BATCH = 10;
  let pending = txHashes;
  for (let attempt = 0; pending.length && attempt < 6; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const txs = await getTransactionsWithRetry(options.chain, batch);
      batch.forEach((hash, j) => { if (txs[j]?.data) calldataByHash.set(hash, txs[j].data); });
    }
    pending = pending.filter((hash) => !calldataByHash.has(hash));
  }

  // Collateral units per signed size unit, per market. An exchange not upgraded to have the
  // field reverts on every call, and every market on it trades 1:1; a market created before
  // the field reads 0, which also means 1. A node that fails some calls but not others is
  // neither: taking 1 there would book 6-decimal sizes as 18-decimal USDC, so the day fails
  // and is retried instead.
  const marketIds = [...new Set(fills.map((log: any) => log.args.marketId.toString()))];
  const units = await options.api.multiCall({
    target: clobExchange,
    abi: SHARE_UNIT_ABI,
    calls: marketIds,
    permitFailure: true,
  });
  const missing = units.filter((u: any) => u == null).length;
  if (missing && missing < units.length)
    throw new Error(`daejin: shareUnit unreadable for ${missing}/${units.length} markets on ${options.chain}`);
  const unitOf = new Map<string, bigint>();
  marketIds.forEach((id, i) => unitOf.set(id, units[i] && BigInt(units[i]) > 0n ? BigInt(units[i]) : 1n));

  for (const log of fills) {
    const unit = unitOf.get(log.args.marketId.toString())!;
    const data = calldataByHash.get(log.transactionHash.toLowerCase());
    if (!data) throw new Error(`daejin: missing transaction ${log.transactionHash} on ${options.chain}`);
    const call = clobIface.parseTransaction({ data });
    if (!call) throw new Error(`daejin: unknown settlement call in ${log.transactionHash}`);
    const execPrice = BigInt(log.args.execPrice);
    const size = BigInt(log.args.size);
    if (call.name === "settleFill") {
      // Two user orders. Volume is one side of the trade: the average of what each side paid.
      const cashA = legCash(BigInt(call.args.orderA.outcome), execPrice, size);
      const cashB = legCash(BigInt(call.args.orderB.outcome), execPrice, size);
      dailyVolume.add(collateral, ((cashA + cashB) / 2n) * unit);
    } else {
      // One user order against the AMM pool: the user's side.
      dailyVolume.add(collateral, legCash(BigInt(call.args.order.outcome), execPrice, size) * unit);
    }
  }

  return { dailyVolume };
};

// Solana. The two programs are Anchor programs that emit no events, so volume is read from the
// arguments of the instructions that move value, which carry the same numbers the EVM events do.
//  prediction_market (AMM) https://solscan.io/account/GgMXNkJR4Vmfd8ievZRBp8Uf8NJX5bdBX96u9FfYComC
//  clob_settlement   (order book) https://solscan.io/account/EJMhw3BibsxMj8az8DsE1D8qUpUDyPSssX2tKpWQ3jeM
// Borsh layout: 8 byte instruction discriminator (sha256("global:<name>")[0..8]), then the args.
//  place_bet(is_yes: bool, amount: u64)                       amount = gross stake, mint units
//  settle_fill(order_a, order_b, hash_a, hash_b, exec_price: u64, size: u64)
//  amm_fill(order, hash, exec_price: u64, size: u64)
//  program_fill(outcome: u8, action: u8, exec_price: u64, size: u64)   leveraged trades, a CPI
//                                                                       from leverage_pool
// An order is (user: Pubkey, market: u64, action: u8, outcome: u8, price, size, salt: u64,
// expiry: i64), 74 bytes, outcome at byte 41. Prices are ticks out of PRICE_TICKS = 1000 and
// size is in the market's payment-mint units, so a leg costs price * size / 1000 of the mint,
// exactly legCash above with a share unit of 1 (the program has no share unit).
// The collateral mint is ClobMarket.payment_mint (bytes 16..48 of the market account, which is
// the first account of each fill instruction); the AMM's is the mint of its vault (3rd account).
const SOLANA_AMM = "GgMXNkJR4Vmfd8ievZRBp8Uf8NJX5bdBX96u9FfYComC";
const SOLANA_CLOB = "EJMhw3BibsxMj8az8DsE1D8qUpUDyPSssX2tKpWQ3jeM";
const IX = {
  placeBet: "de3e43dc3fa67e21",
  settleFill: "c5518732bf03ab4b",
  ammFill: "0576f116c5d5d16e",
  programFill: "f93fc68acd1d9076",
};
const ORDER_LEN = 74;
const ORDER_OUTCOME = 41;
const MARKET_MINT_OFFSET = 16;

// Which of a program's transactions are fills is only known once the transaction is read (a
// busy day is mostly deposits, withdrawals and market setup), so every one is fetched. The
// runner fetches several windows at once, so the limit on requests in flight is shared by the
// whole process.
const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const waiting: (() => void)[] = [];
const limited = async <T>(task: () => Promise<T>): Promise<T> => {
  if (inFlight >= MAX_IN_FLIGHT) await new Promise<void>((resolve) => waiting.push(resolve));
  inFlight++;
  try { return await task(); }
  finally { inFlight--; waiting.shift()?.(); }
};

// A 429 pauses every request, not only the one that got it. The public RPC allows 10 requests
// per 10 seconds per method and counts the rejected ones too (response headers
// x-ratelimit-method-limit: 10 and retry-after: 10, api.mainnet-beta.solana.com, 2026-11-25),
// so a request backing off alone keeps being rejected while the others refill the window.
// The pause is that retry-after plus a second; an endpoint that never answers 429 never waits.
const COOLDOWN_MS = 11_000;
const MAX_RATE_LIMIT_RETRIES = 8; // a request is rejected about once per cooldown at worst
let pausedUntil = 0;
const rateLimited = (e: any) => /429|Too many requests/i.test(String(e?.message));
const rpc = async <T>(task: () => Promise<T>): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try {
      return await limited(async () => {
        // Re-checked after each wait: another request may have extended the pause meanwhile.
        while (pausedUntil > Date.now())
          await new Promise((resolve) => setTimeout(resolve, pausedUntil - Date.now()));
        return task();
      });
    } catch (e) {
      if (attempt >= MAX_RATE_LIMIT_RETRIES || !rateLimited(e)) throw e;
      pausedUntil = Math.max(pausedUntil, Date.now() + COOLDOWN_MS);
    }
  }
};

// Signatures can only be listed newest first, so finding one hour means paging back from the
// newest transaction. With pullHourly the runner asks for 24 windows a day, several at once,
// and walking the list again for each one is what got the public RPC to answer 429. Instead
// each program's list is walked once per process and shared: every window extends the walk
// only as far back as it needs, and the walks are serialised so concurrent windows wait for
// one walk rather than each starting their own.
type SignatureWalk = {
  entries: { signature: string; blockTime: number; failed: boolean }[]; // newest first
  newest?: string;      // newest signature seen, the `until` bound for refreshing the head
  oldest?: string;      // oldest signature seen, the `before` cursor for going further back
  oldestTime: number;   // blockTime the walk has reached back to
  headTime: number;     // when the head was last read; later windows refresh it first
  exhausted: boolean;   // the program's first transaction has been reached
  queue: Promise<unknown>;
};
const signatureWalks = new Map<string, SignatureWalk>();
const PAGE = 1000;

const readPages = async (address: string, bounds: { before?: string; until?: string }, stopBefore = -Infinity) => {
  const entries: SignatureWalk["entries"] = [];
  let before = bounds.before;
  let complete = false;
  while (true) {
    const page = await rpc(() => getSignaturesForAddress({ address, limit: PAGE, before, until: bounds.until }));
    for (const entry of page ?? []) {
      // A signature without a blockTime yet cannot be placed in a window; the next head
      // refresh picks it up once it has one.
      if (entry.blockTime != null)
        entries.push({ signature: entry.signature, blockTime: entry.blockTime, failed: !!entry.err });
    }
    if (!page?.length || page.length < PAGE) { complete = true; break; }
    before = page[page.length - 1].signature;
    const oldest = entries[entries.length - 1]?.blockTime;
    if (oldest != null && oldest < stopBefore) break;
  }
  return { entries, before, complete };
};

const signaturesInWindow = async (address: string, from: number, to: number) => {
  let walk = signatureWalks.get(address);
  if (!walk) {
    walk = { entries: [], oldestTime: Infinity, headTime: 0, exhausted: false, queue: Promise.resolve() };
    signatureWalks.set(address, walk);
  }
  const w = walk;
  const run = w.queue.then(async () => {
    // Head: a window ending after the last read may hold newer transactions.
    if ((w.newest || w.exhausted) && to > w.headTime) {
      const startedAt = Math.floor(Date.now() / 1000);
      const { entries } = await readPages(address, { until: w.newest });
      if (entries.length) { w.entries = [...entries, ...w.entries]; w.newest = entries[0].signature; }
      w.headTime = startedAt;
    }
    // Tail: page back until the walk reaches the start of the window.
    if (!w.exhausted && !(w.oldestTime < from)) {
      const startedAt = Math.floor(Date.now() / 1000);
      const { entries, before, complete } = await readPages(address, { before: w.oldest }, from);
      if (!w.newest) { w.newest = entries[0]?.signature; w.headTime = startedAt; }
      w.entries.push(...entries);
      w.oldest = before ?? w.oldest;
      if (entries.length) w.oldestTime = entries[entries.length - 1].blockTime;
      w.exhausted = complete;
    }
  });
  // A failed walk must not poison the windows queued behind it; they retry it.
  w.queue = run.catch(() => undefined);
  await run;
  return w.entries
    .filter((entry) => !entry.failed && entry.blockTime >= from && entry.blockTime < to)
    .map((entry) => entry.signature);
};

// Top-level and inner instructions addressed to `programId` (program_fill only ever arrives as
// an inner instruction, through leverage_pool).
const programInstructions = (tx: any, programId: string) => {
  const all = [
    ...tx.transaction.message.instructions,
    ...(tx.meta.innerInstructions ?? []).flatMap((group: any) => group.instructions),
  ];
  return all
    .filter((ix: any) => ix.programId === programId && typeof ix.data === "string")
    .map((ix: any) => ({ accounts: ix.accounts as string[], data: Buffer.from(base58Decode(ix.data)) }));
};

const fetchTransaction = async (signature: string) => {
  const tx = await rpc(() =>
    getTransaction({ signature, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }));
  // A node that cannot serve the transaction is not a transaction without volume.
  if (!tx?.meta) throw new Error(`daejin: solana rpc returned no transaction for ${signature}`);
  return tx;
};

const loadTransactions = (signatures: string[]) => Promise.all(signatures.map(fetchTransaction));

const marketMints = new Map<string, string>();

const fetchSolana = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const from = options.startTimestamp;
  const to = options.endTimestamp;

  // AMM bets: the stake in the vault's mint.
  for (const tx of await loadTransactions(await signaturesInWindow(SOLANA_AMM, from, to))) {
    const keys: string[] = tx.transaction.message.accountKeys.map((key: any) => key.pubkey ?? key);
    for (const ix of programInstructions(tx, SOLANA_AMM)) {
      if (ix.data.subarray(0, 8).toString("hex") !== IX.placeBet) continue;
      const vault = ix.accounts[2];
      const balance = [...(tx.meta.postTokenBalances ?? []), ...(tx.meta.preTokenBalances ?? [])]
        .find((b: any) => keys[b.accountIndex] === vault);
      if (!balance) throw new Error(`daejin: no vault balance in ${tx.transaction.signatures[0]}`);
      dailyVolume.add(balance.mint, ix.data.readBigUInt64LE(9));
    }
  }

  // Order-book fills: one side of each trade, as on the EVM chains.
  const fills: { market: string; cash: bigint }[] = [];
  for (const tx of await loadTransactions(await signaturesInWindow(SOLANA_CLOB, from, to))) {
    for (const ix of programInstructions(tx, SOLANA_CLOB)) {
      const d = ix.data;
      const kind = d.subarray(0, 8).toString("hex");
      if (kind === IX.settleFill) {
        const at = 8 + 2 * ORDER_LEN + 64;
        const execPrice = d.readBigUInt64LE(at);
        const size = d.readBigUInt64LE(at + 8);
        const cashA = legCash(BigInt(d[8 + ORDER_OUTCOME]), execPrice, size);
        const cashB = legCash(BigInt(d[8 + ORDER_LEN + ORDER_OUTCOME]), execPrice, size);
        fills.push({ market: ix.accounts[0], cash: (cashA + cashB) / 2n });
      } else if (kind === IX.ammFill) {
        const at = 8 + ORDER_LEN + 32;
        fills.push({ market: ix.accounts[0], cash: legCash(BigInt(d[8 + ORDER_OUTCOME]), d.readBigUInt64LE(at), d.readBigUInt64LE(at + 8)) });
      } else if (kind === IX.programFill) {
        fills.push({ market: ix.accounts[0], cash: legCash(BigInt(d[8]), d.readBigUInt64LE(10), d.readBigUInt64LE(18)) });
      }
    }
  }
  if (!fills.length) return { dailyVolume };

  // A market's payment mint never changes, so it is read once per process.
  const unknown = [...new Set(fills.map((fill) => fill.market))].filter((market) => !marketMints.has(market));
  if (unknown.length) {
    const buffers = await rpc(() => getAccountBuffers({ accounts: unknown }));
    unknown.forEach((market, i) => {
      const buffer = buffers[i];
      if (!buffer) throw new Error(`daejin: market account ${market} unreadable`);
      marketMints.set(market, base58Encode(buffer.subarray(MARKET_MINT_OFFSET, MARKET_MINT_OFFSET + 32)));
    });
  }
  for (const fill of fills) dailyVolume.add(marketMints.get(fill.market)!, fill.cash);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: fetchEvm, start: "2026-08-01" },
    [CHAIN.BSC]: { fetch: fetchEvm, start: "2026-08-01" },
    [CHAIN.SOLANA]: { fetch: fetchSolana, start: "2026-09-09" },
  },
  methodology: {
    Volume:
      "AMM markets: collateral paid per bet (BetPlaced cashAmount on EVM, place_bet amount on Solana), gross of fees, in the bet token. Order-book markets: collateral exchanged per settled fill (settleFill/ammFill on EVM; settle_fill, amm_fill and leveraged program_fill on Solana), one side counted (average of both legs at the execution price), gross of fees, in USDC. LP deposits, claims and refunds are not counted.",
  },
};

export default adapter;
