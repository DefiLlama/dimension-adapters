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

// Every signature of a program inside the window, oldest pages last. Both programs see a few
// dozen transactions a day, so walking back from the newest is cheap.
const signaturesInWindow = async (address: string, from: number, to: number) => {
  const signatures: string[] = [];
  let before: string | undefined;
  while (true) {
    const page = await getSignaturesForAddress({ address, limit: 1000, before });
    if (!page?.length) break;
    for (const entry of page) {
      const time = entry.blockTime;
      if (!entry.err && time != null && time >= from && time < to) signatures.push(entry.signature);
    }
    // A signature without a blockTime yet says nothing about where the window ends; keep paging.
    const oldest = [...page].reverse().find((entry) => entry.blockTime != null)?.blockTime;
    if (page.length < 1000 || (oldest != null && oldest < from)) break;
    before = page[page.length - 1].signature;
  }
  return signatures;
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

const loadTransactions = async (signatures: string[]) => {
  const txs: any[] = [];
  const BATCH = 10;
  for (let i = 0; i < signatures.length; i += BATCH) {
    const batch = await Promise.all(signatures.slice(i, i + BATCH).map((signature) =>
      getTransaction({ signature, encoding: "jsonParsed", maxSupportedTransactionVersion: 0 })));
    batch.forEach((tx, j) => {
      // A node that cannot serve the transaction is not a transaction without volume.
      if (!tx?.meta) throw new Error(`daejin: solana rpc returned no transaction for ${signatures[i + j]}`);
      txs.push(tx);
    });
  }
  return txs;
};

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

  const markets = [...new Set(fills.map((fill) => fill.market))];
  const buffers = await getAccountBuffers({ accounts: markets });
  const mintOf = new Map<string, string>();
  markets.forEach((market, i) => {
    const buffer = buffers[i];
    if (!buffer) throw new Error(`daejin: market account ${market} unreadable`);
    mintOf.set(market, base58Encode(buffer.subarray(MARKET_MINT_OFFSET, MARKET_MINT_OFFSET + 32)));
  });
  for (const fill of fills) dailyVolume.add(mintOf.get(fill.market)!, fill.cash);

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
