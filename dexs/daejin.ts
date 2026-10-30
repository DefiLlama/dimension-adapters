import { Interface } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTransactionsWithRetry } from "../helpers/getTxReceipts";

// Daejin runs two kinds of prediction market on each chain:
//  - AMM markets (PredictionMarket): every bet emits BetPlaced with the cash paid and the token.
//  - Order-book markets (ClobExchange): the matching engine's bridge settles each fill on-chain
//    with settleFill (two signed orders) or ammFill (one order against the AMM pool).
const CONTRACTS: Record<string, { predictionMarket: string; clobExchange: string; collateral: string }> = {
  [CHAIN.ETHEREUM]: {
    predictionMarket: "0xA528f636bAE87FF2c3e4d5718313cfC38C1B0be9",
    clobExchange: "0x9b00A64FF4a8F72D6Ff463fFe3acBC01cf5DB24f",
    collateral: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC, 6 decimals
  },
  [CHAIN.BSC]: {
    predictionMarket: "0x7B8F913097242e21895F3731206F07d753170c07",
    clobExchange: "0x792a699e6A35566Ae293AD560698C41917B27b02",
    collateral: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // USDC, 18 decimals
  },
};

// cashAmount is the gross stake in the bet token's raw units; token 0x0 is the chain's native coin
const BET_PLACED =
  "event BetPlaced(uint256 indexed marketId, address indexed bettor, bool isYes, address token, uint256 cashAmount, uint256 sharesReceived, uint256 priceNum, uint256 priceDen)";
const NATIVE = "0x0000000000000000000000000000000000000000";

// One event per fill. size is in shares (1 share = 1 raw collateral unit at resolution),
// execPrice is the YES price in ticks out of PRICE_TICKS. The outcome each side traded is not
// in the event, so it is read from the settlement call's calldata below.
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

// Collateral one side pays (or receives) for `size` shares of `outcome` at execPrice.
const legCash = (outcome: bigint, execPrice: bigint, size: bigint): bigint => {
  const px = outcome === OUTCOME_YES ? execPrice : PRICE_TICKS - execPrice;
  return (px * size) / PRICE_TICKS;
};

const fetch = async (options: FetchOptions) => {
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

  // One settlement per transaction, ~2k a day on BSC. Fetched in small batches so public RPCs
  // don't start answering null under the helper's default concurrency.
  const txHashes = [...new Set(fills.map((log: any) => log.transactionHash.toLowerCase()))];
  const calldataByHash = new Map<string, string>();
  const BATCH = 10;
  let pending = txHashes;
  for (let attempt = 0; pending.length && attempt < 6; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 1000 * attempt));
    for (let i = 0; i < pending.length; i += BATCH) {
      const batch = pending.slice(i, i + BATCH);
      const txs = await getTransactionsWithRetry(options.chain, batch);
      batch.forEach((hash, j) => { if (txs[j]?.data) calldataByHash.set(hash, txs[j].data); });
    }
    pending = pending.filter((hash) => !calldataByHash.has(hash));
  }

  for (const log of fills) {
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
      dailyVolume.add(collateral, (cashA + cashB) / 2n);
    } else {
      // One user order against the AMM pool: the user's side.
      dailyVolume.add(collateral, legCash(BigInt(call.args.order.outcome), execPrice, size));
    }
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BSC],
  start: "2026-08-01",
  methodology: {
    Volume:
      "AMM markets: collateral paid per bet (BetPlaced cashAmount), gross of fees, in the bet token. Order-book markets: collateral exchanged per settled fill, one side counted (average of both legs at the execution price), gross of fees, in USDC. LP deposits, claims and refunds are not counted.",
  },
};

export default adapter;
