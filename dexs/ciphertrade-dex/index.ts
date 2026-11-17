import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CipherTrade DEX (CipherDEX Protocol) mainnet manifests, chain 2632500.
// https://app.ciphertrade.org
const MODE0_FACTORY = "0x1909751000de0d15f81394b47eca1931184d51e0";
const MODE3_FACTORY = "0x418df4557ffc1d8f568b3583936a6cfaec543a91";
const PUBLIC_BOOK = "0xff3372d73131d56f4bc7ad2fc8545b0316d0a1ce";
const HYBRID_ROUTER = "0x85c6e8ff5b718c233f04f870cba1917411a180ea";
// Inclusive factory deployment blocks, not later discovery checkpoints.
// Neither factory can have emitted pool-creation events before its deployment.
const FROM_MODE0 = 9437576; // Mode 0 factory: tx 0x0d42118c...f026134b
const FROM_MODE3 = 9886358; // Mode 3 factory: tx 0xb2d9f82e...da78a15
const FROM_BOOK = 9884872;

// Map only exact mainnet token identities from the CipherTrade Registry.
// All other tokens retain their COTI contract address for native pricing.
const PRICE_REFERENCES: Record<string, { id: string; decimals: number }> = {
  "0xd2f2692b83c3ecdf2eaa0f7c2632bbd46ae1cc91": { id: "coti", decimals: 18 }, // p.COTI
  "0xe180548963fc30329e15bc104d753f82a8c18865": { id: "coti", decimals: 18 }, // WCOTI
  "0x7637c7838ec4ec6b85080f28a678f8e234bb83d1": { id: "coti-governance-token", decimals: 18 }, // gCOTI
  "0xf1feebc4376c68b7003450ae66343ae59ab37d3c": { id: "usd-coin", decimals: 6 }, // USDC.e
  "0x63c9a1d05471fc8d47c83968725dcfdcb5410392": { id: "usd-coin", decimals: 6 }, // p.USDC.e
  "0xfa6f73446b17a97a56e464256da54ad43c2cbc3e": { id: "tether", decimals: 6 }, // USDT
  "0x42107250c3d385ddfabe69ab6de163702040feb0": { id: "tether", decimals: 6 }, // p.USDT
  "0x639acc80569c5fc83c6fbf2319a6cc38bbfe26d1": { id: "ethereum", decimals: 18 }, // wETH
  "0x4727fe8d8450cebcb142331fac034cd8d311f0e5": { id: "ethereum", decimals: 18 }, // p.wETH
  "0x8c39b1fd0e6260fdf20652fc436d25026832bfea": { id: "bitcoin", decimals: 8 }, // wBTC
  "0x65449561257ba5756631aa0d34f07f6457a319be": { id: "bitcoin", decimals: 8 }, // p.wBTC
  "0xe757ca19d2c237aa52ebb1d2e8e4368eea3eb331": { id: "cardano", decimals: 6 }, // wADA
  "0x3a8b49aac1dad86aa45a75231fbec5beb810e416": { id: "cardano", decimals: 6 }, // p.wADA
  "0xfc075bd3e22d337c19b7ca25635282ad8e24941a": { id: "midnight-3", decimals: 6 }, // NIGHT
  "0x394b3c4328160f000763ca391d07f902926edaac": { id: "coti-governance-token", decimals: 18 }, // p.gCOTI
};

// Both factories emit the pool address and its token identities at creation.
// Index those immutable event facts instead of doing historical eth_call reads:
// COTI public RPCs may not retain the corresponding historical state tries.
const STANDARD_POOL = "event StandardPoolCreated(bytes32 indexed poolKey, address indexed token0, address indexed token1, uint256 feeBps, address pool, address lpToken, bytes32 poolRuntimeCodehash, bytes32 lpTokenRuntimeCodehash)";
const INSTANCE_POOL = "event StandardPoolInstanceCreated(bytes32 indexed poolKey, address indexed token0, address indexed token1, uint256 feeBps, address pool, address lpToken, bytes32 poolRuntimeCodehash, bytes32 lpTokenRuntimeCodehash, bytes32 instanceId, address instanceNamespace, bytes32 nonce)";
const PROTECTED_POOL = "event ProtectedPoolReserved(bytes32 indexed poolKey, address indexed protectedToken, address indexed reservingLaunchFactory, address token0, address token1, uint256 feeBps, address pool, address lpToken, bytes32 poolRuntimeCodehash, bytes32 lpTokenRuntimeCodehash)";
const POOL_CREATION_EVENTS = [STANDARD_POOL, INSTANCE_POOL, PROTECTED_POOL];

const POOL_SWAP = "event SwapExecuted(address indexed trader, address indexed recipient, bool indexed zeroForOne, uint256 amountIn, uint256 amountOut, uint256 netInput, uint256 protocolFee, uint256 lpFee)";
const HYBRID_LEG = "event HybridLegExecuted(uint256 indexed index, uint8 kind, address indexed tokenIn, address indexed tokenOut, address venue, uint256 orderId, uint256 amountIn, uint256 amountOut, uint256 matchingFee)";
const HYBRID_SWAP = "event HybridSwapExecuted(address indexed caller, address indexed recipient, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 legCount, uint8 settlementMode)";
const ORDER_CREATED = "event OrderCreated(uint256 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 minAmountOut, uint64 expiry, uint8 feeTierPolicy, bool allowPartialFills, uint256 minimumFillAmount, uint256 executionBounty, uint8 settlementMode, uint32 maxMatchingFeePpm)";
const DIRECT_FILL = "event DirectOrderFilled(uint256 indexed orderId, address indexed maker, address indexed payer, address recipient, uint256 makerAmountIn, uint256 makerAmountOut, uint256 matchingFee, uint256 remainingAmountIn, address bountyRecipient, uint256 bounty)";
const ORDERS_MATCHED = "event OrdersMatched(uint256 indexed restingOrderId, uint256 indexed takingOrderId, address indexed filler, uint256 restingAmountIn, uint256 takingAmountIn, uint256 matchingFee, uint256 restingRemaining, uint256 takingRemaining, uint256 restingBounty, uint256 takingBounty)";

function humanUnits(amount: bigint, decimals: number): string {
  const value = amount.toString().padStart(decimals + 1, "0");
  if (!decimals) return value;
  const fraction = value.slice(-decimals).replace(/0+$/, "");
  return fraction ? value.slice(0, -decimals) + "." + fraction : value.slice(0, -decimals);
}

function addAmount(balances: ReturnType<FetchOptions["createBalances"]>, token: string, raw: bigint) {
  if (raw <= 0n) return;
  const ref = PRICE_REFERENCES[token.toLowerCase()];
  if (ref) {
    // DefiLlama Balances.add expects numeric CoinGecko units, not decimal strings.
    const amount = Number(humanUnits(raw, ref.decimals));
    if (!Number.isFinite(amount)) throw new Error("CipherTrade DEX: non-finite mapped amount");
    // CoinGecko IDs are global, not scoped to the COTI chain.
    balances.add(`coingecko:${ref.id}`, amount, { skipChain: true });
  }
  else balances.add(token, raw.toString());
}

function logIndex(log: any): number {
  const value = log.logIndex ?? log.index;
  if (value == null || !Number.isSafeInteger(Number(value))) throw new Error("CipherTrade DEX: missing log index");
  return Number(value);
}

function logKey(log: any): string {
  if (!/^0x[0-9a-f]{64}$/.test(String(log.transactionHash ?? "").toLowerCase()))
    throw new Error("CipherTrade DEX: missing transaction hash");
  return String(log.transactionHash).toLowerCase() + ":" + logIndex(log);
}

async function getPools(options: FetchOptions): Promise<Map<string, [string, string]>> {
  const factories = [
    { address: MODE0_FACTORY, fromBlock: FROM_MODE0 },
    { address: MODE3_FACTORY, fromBlock: FROM_MODE3 },
  ].filter(({ fromBlock }) => !options.toApi.block || options.toApi.block >= fromBlock);

  const logs = await Promise.all(factories.flatMap(({ address, fromBlock }) =>
    POOL_CREATION_EVENTS.map(eventAbi =>
      options.getLogs({ target: address, eventAbi, fromBlock, cacheInCloud: true })
    )
  ));
  const pools = new Map<string, [string, string]>();
  for (const group of logs) for (const log of group) {
    const address = String(log.pool ?? "").toLowerCase();
    const token0 = String(log.token0 ?? "").toLowerCase();
    const token1 = String(log.token1 ?? "").toLowerCase();
    if (![address, token0, token1].every(value => /^0x[0-9a-f]{40}$/.test(value)))
      throw new Error("CipherTrade DEX: malformed factory pool event");
    const existing = pools.get(address);
    if (existing && (existing[0] !== token0 || existing[1] !== token1))
      throw new Error(`CipherTrade DEX: contradictory pool creation logs for ${address}`);
    pools.set(address, [token0, token1]);
  }
  return pools;
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const pairTokens = await getPools(options);
  const pools = [...pairTokens.keys()];

  // Count the user-facing hybrid aggregate only once, and suppress precisely
  // its underlying pool/book legs. Preserve unrelated executions in the same tx.
  const [swaps, legs, hybrid, created, direct, matched] = await Promise.all([
    pools.length ? options.getLogs({ targets: pools, eventAbi: POOL_SWAP, onlyArgs: false }) : [],
    options.getLogs({ target: HYBRID_ROUTER, eventAbi: HYBRID_LEG, onlyArgs: false }),
    options.getLogs({ target: HYBRID_ROUTER, eventAbi: HYBRID_SWAP, onlyArgs: false }),
    options.getLogs({ target: PUBLIC_BOOK, eventAbi: ORDER_CREATED, fromBlock: FROM_BOOK, cacheInCloud: true }),
    options.getLogs({ target: PUBLIC_BOOK, eventAbi: DIRECT_FILL, onlyArgs: false }),
    options.getLogs({ target: PUBLIC_BOOK, eventAbi: ORDERS_MATCHED }),
  ]);
  const orderTokens = new Map<string, { inToken: string; outToken: string }>();
  for (const e of created) orderTokens.set(String(e.orderId), { inToken: e.tokenIn, outToken: e.tokenOut });

  const underlyings = [...swaps.map((log: any) => ({ kind: 0, log })),
                       ...direct.map((log: any) => ({ kind: 1, log }))];
  const underlyingByTx = new Map<string, typeof underlyings>();
  for (const entry of underlyings) {
    const tx = String(entry.log.transactionHash).toLowerCase();
    const list = underlyingByTx.get(tx) ?? [];
    list.push(entry);
    underlyingByTx.set(tx, list);
  }
  const routed = new Set<string>();
  const legCounts = new Map<string, number>();
  for (const leg of legs) {
    const tx = String(leg.transactionHash).toLowerCase();
    legCounts.set(tx, (legCounts.get(tx) ?? 0) + 1);
    const kind = Number(leg.args.kind);
    const possible = (underlyingByTx.get(tx) ?? []).filter(({ kind: executionKind, log }) => {
      if (executionKind !== kind || logIndex(log) >= logIndex(leg) || routed.has(logKey(log))) return false;
      if (kind === 0) {
        const pair = pairTokens.get(String(log.address).toLowerCase());
        if (!pair || String(leg.args.venue).toLowerCase() !== String(log.address).toLowerCase()) return false;
        const input = pair[log.args.zeroForOne ? 0 : 1], output = pair[log.args.zeroForOne ? 1 : 0];
        return input.toLowerCase() === String(leg.args.tokenIn).toLowerCase()
          && output.toLowerCase() === String(leg.args.tokenOut).toLowerCase()
          && BigInt(log.args.amountIn) === BigInt(leg.args.amountIn);
      }
      if (kind !== 1 || String(leg.args.venue).toLowerCase() !== PUBLIC_BOOK) return false;
      const order = orderTokens.get(String(log.args.orderId));
      return !!order && String(log.args.orderId) === String(leg.args.orderId)
        && order.outToken.toLowerCase() === String(leg.args.tokenIn).toLowerCase()
        && order.inToken.toLowerCase() === String(leg.args.tokenOut).toLowerCase()
        && BigInt(log.args.makerAmountOut) + BigInt(log.args.matchingFee) === BigInt(leg.args.amountIn);
    }).sort((a, b) => logIndex(b.log) - logIndex(a.log));
    if (!possible.length) throw new Error(`CipherTrade DEX: unmatched hybrid leg ${logKey(leg)}`);
    routed.add(logKey(possible[0].log));
  }
  const expectedLegs = new Map<string, number>();
  for (const log of hybrid) {
    const tx = String(log.transactionHash).toLowerCase();
    expectedLegs.set(tx, (expectedLegs.get(tx) ?? 0) + Number(log.args.legCount));
    addAmount(dailyVolume, log.args.tokenIn, BigInt(log.args.amountIn));
  }
  for (const [tx, count] of expectedLegs)
    if (count !== (legCounts.get(tx) ?? 0)) throw new Error(`CipherTrade DEX: hybrid leg count mismatch ${tx}`);
  for (const tx of legCounts.keys())
    if (!expectedLegs.has(tx)) throw new Error(`CipherTrade DEX: missing hybrid aggregate ${tx}`);

  for (const log of swaps) {
    if (routed.has(logKey(log))) continue;
    const pair = pairTokens.get(String(log.address).toLowerCase());
    if (!pair) throw new Error(`CipherTrade DEX: unknown swap pool ${log.address}`);
    addAmount(dailyVolume, pair[log.args.zeroForOne ? 0 : 1], BigInt(log.args.amountIn));
  }
  for (const log of direct) {
    if (routed.has(logKey(log))) continue;
    const order = orderTokens.get(String(log.args.orderId));
    if (!order) throw new Error(`CipherTrade DEX: missing order metadata ${log.args.orderId}`);
    // The taker pays maker proceeds + the matching fee; both are gross input.
    addAmount(dailyVolume, order.outToken, BigInt(log.args.makerAmountOut) + BigInt(log.args.matchingFee));
  }
  for (const log of matched) {
    const order = orderTokens.get(String(log.restingOrderId));
    if (!order) throw new Error(`CipherTrade DEX: missing matched order metadata ${log.restingOrderId}`);
    // One resting-side gross amount per cross match, not two sides.
    addAmount(dailyVolume, order.inToken, BigInt(log.restingAmountIn));
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.COTI],
  start: "2026-09-20",
  fetch,
  methodology: {
    Volume: "Gross single-sided volume from Mode 0 and transparent Mode 3 pool swaps, public book fills and user-facing hybrid swaps. Routed pool/book legs are excluded individually to avoid double counting, preserving unrelated executions in the same transaction. Confidential private order amounts are excluded.",
  },
};

export default adapter;
