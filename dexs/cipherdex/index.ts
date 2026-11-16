import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// CipherDEX Protocol mainnet manifests, chain 2632500.
// https://app.ciphertrade.org
const MODE0_FACTORY = "0x1909751000de0d15f81394b47eca1931184d51e0";
const MODE3_FACTORY = "0x418df4557ffc1d8f568b3583936a6cfaec543a91";
const PUBLIC_BOOK = "0xff3372d73131d56f4bc7ad2fc8545b0316d0a1ce";
const HYBRID_ROUTER = "0x85c6e8ff5b718c233f04f870cba1917411a180ea";
const FROM_MODE0 = 9441564; // Source manifest checkpoint; older factory pool enumeration remains on chain.
const FROM_MODE3 = 9886358;
const FROM_BOOK = 9884872;

// Only official, address-matched, redeemable 1:1 wrappers are remapped.
// All other settlement tokens retain their own COTI token address.
const PRICE_REFERENCES: Record<string, { id: string; decimals: number }> = {
  "0xe180548963fc30329e15bc104d753f82a8c18865": { id: "coti", decimals: 18 }, // WCOTI
  "0xd2f2692b83c3ecdf2eaa0f7c2632bbd46ae1cc91": { id: "coti", decimals: 18 }, // p.COTI
  "0x63c9a1d05471fc8d47c83968725dcfdcb5410392": { id: "usd-coin", decimals: 6 }, // p.USDC.e
};

const ALL_POOLS_LENGTH = "uint256:allPoolsLength";
const ALL_POOLS = "function allPools(uint256) view returns (address)";
const TOKEN0 = "address:token0";
const TOKEN1 = "address:token1";

const POOL_SWAP = "event SwapExecuted(address indexed trader, address indexed recipient, bool indexed zeroForOne, uint256 amountIn, uint256 amountOut, uint256 netInput, uint256 protocolFee, uint256 lpFee)";
const HYBRID_SWAP = "event HybridSwapExecuted(address indexed caller, address indexed recipient, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 legCount, uint8 settlementMode)";
const ORDER_CREATED = "event OrderCreated(uint256 indexed orderId, address indexed maker, address indexed tokenIn, address tokenOut, address recipient, uint256 amountIn, uint256 minAmountOut, uint64 expiry, uint8 feeTierPolicy, bool allowPartialFills, uint256 minimumFillAmount, uint256 executionBounty, uint8 settlementMode, uint32 maxMatchingFeePpm)";
const DIRECT_FILL = "event DirectOrderFilled(uint256 indexed orderId, address indexed maker, address indexed payer, address recipient, uint256 makerAmountIn, uint256 makerAmountOut, uint256 matchingFee, uint256 remainingAmountIn, address bountyRecipient, uint256 bounty)";
const ORDERS_MATCHED = "event OrdersMatched(uint256 indexed restingOrderId, uint256 indexed takingOrderId, address indexed filler, uint256 restingAmountIn, uint256 takingAmountIn, uint256 matchingFee, uint256 restingRemaining, uint256 takingRemaining, uint256 restingBounty, uint256 takingBounty)";

function addAmount(balances: ReturnType<FetchOptions["createBalances"]>, token: string, raw: bigint) {
  if (raw <= 0n) return;
  const ref = PRICE_REFERENCES[token.toLowerCase()];
  if (ref) balances.add(`coingecko:${ref.id}`, Number(raw) / 10 ** ref.decimals);
  else balances.add(token, raw.toString());
}

async function getPools(options: FetchOptions): Promise<string[]> {
  // A consistent end-of-window snapshot includes every pool existing by then.
  const factories = [
    { address: MODE0_FACTORY, start: FROM_MODE0 },
    { address: MODE3_FACTORY, start: FROM_MODE3 },
  ].filter(({ start }) => !options.toApi.block || options.toApi.block >= start);
  const groups = await Promise.all(factories.map(({ address }) =>
    options.toApi.fetchList({ target: address, lengthAbi: ALL_POOLS_LENGTH, itemAbi: ALL_POOLS })
  ));
  return [...new Set(groups.flat().map((address: string) => address.toLowerCase()))];
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const pools = await getPools(options);

  // The hybrid router emits one aggregate per user-facing swap, even when its
  // routed legs also emit pool and book events. Its event is authoritative.
  const hybrid = await options.getLogs({
    target: HYBRID_ROUTER, eventAbi: HYBRID_SWAP, onlyArgs: false,
  });
  const routedTxs = new Set(hybrid.map((log: any) => String(log.transactionHash).toLowerCase()));
  for (const log of hybrid) {
    addAmount(dailyVolume, log.args.tokenIn, BigInt(log.args.amountIn));
  }

  if (pools.length) {
    const [token0s, token1s] = await Promise.all([
      options.toApi.multiCall({ abi: TOKEN0, calls: pools }),
      options.toApi.multiCall({ abi: TOKEN1, calls: pools }),
    ]);
    const tokens = new Map(pools.map((pool, i) => [pool, [token0s[i], token1s[i]]]));
    const swaps = await options.getLogs({ targets: pools, eventAbi: POOL_SWAP, onlyArgs: false });
    for (const log of swaps) {
      if (routedTxs.has(String(log.transactionHash).toLowerCase())) continue;
      const pair = tokens.get(log.address.toLowerCase());
      if (!pair) throw new Error(`CipherDEX: unknown swap pool ${log.address}`);
      addAmount(dailyVolume, pair[log.args.zeroForOne ? 0 : 1], BigInt(log.args.amountIn));
    }
  }

  // Standalone direct and order-to-order matching creates trades without AMM
  // SwapExecuted events. OrderFilled is deliberately not counted: those order
  // executions settle against a pool and are already included above.
  // Historical order creation events supply the authentic asset identity for
  // fully filled/deleted orders. No private order amounts are read.
  if (!options.toApi.block || options.toApi.block >= FROM_BOOK) {
    const [created, direct, matched] = await Promise.all([
      options.getLogs({ target: PUBLIC_BOOK, eventAbi: ORDER_CREATED, fromBlock: FROM_BOOK, cacheInCloud: true }),
      options.getLogs({ target: PUBLIC_BOOK, eventAbi: DIRECT_FILL, onlyArgs: false }),
      options.getLogs({ target: PUBLIC_BOOK, eventAbi: ORDERS_MATCHED, onlyArgs: false }),
    ]);
    const tokensByOrder = new Map<string, { inToken: string; outToken: string }>();
    for (const event of created) tokensByOrder.set(String(event.orderId), { inToken: event.tokenIn, outToken: event.tokenOut });
    for (const log of direct) {
      if (routedTxs.has(String(log.transactionHash).toLowerCase())) continue;
      const tokens = tokensByOrder.get(String(log.args.orderId));
      if (!tokens) throw new Error(`CipherDEX: missing order metadata ${log.args.orderId}`);
      addAmount(dailyVolume, tokens.outToken, BigInt(log.args.makerAmountOut) + BigInt(log.args.matchingFee));
    }
    for (const log of matched) {
      if (routedTxs.has(String(log.transactionHash).toLowerCase())) continue;
      const tokens = tokensByOrder.get(String(log.args.restingOrderId));
      if (!tokens) throw new Error(`CipherDEX: missing matched order metadata ${log.args.restingOrderId}`);
      addAmount(dailyVolume, tokens.inToken, BigInt(log.args.restingAmountIn));
    }
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
    Volume: "Gross input volume from on-chain public Mode 0 and transparent private Mode 3 pool SwapExecuted events, public order-to-order/direct matching fills, and one user-level HybridSwapExecuted event per routed swap. Hybrid pool/book legs and standalone pool-backed OrderFilled events are not counted twice. Confidential private order sizes are excluded.",
  },
};

export default adapter;
