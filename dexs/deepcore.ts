import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { addOneToken } from "../helpers/prices";

/**
 * DeepCore Protocol - swap volume, swap fees and the LP/protocol split.
 *
 * DeepCore is a Uniswap-v4-style singleton AMM forked from PancakeSwap Infinity. A
 * single `Vault` custodies every token; two pool managers register against it as
 * "apps" and hold nothing themselves:
 *
 *   CLPoolManager   concentrated liquidity
 *   BinPoolManager  liquidity book / bins
 *
 * Both emit their own `Swap`, and both carry the same two fee numbers, so one
 * code path covers them. See `FEE MODEL` below.
 *
 * Website: https://deepcore.fun  (docs: https://docs.deepcore.fun)
 * GitHub:  https://github.com/deep-core-protocol
 *
 * ---------------------------------------------------------------------------
 * TOPIC0 COLLISION - read before touching the log queries
 * ---------------------------------------------------------------------------
 * Vault, CLPoolManager, BinPoolManager and the shared `ProtocolFees` base declare
 * 34 events between them but only 22 distinct signatures. Six signatures are
 * byte-identical across contracts and therefore share a topic0:
 *
 *   OwnershipTransferred(address,address)      Vault, CL, Bin, ProtocolFees
 *   DynamicLPFeeUpdated(bytes32,uint24)        CL, Bin
 *   Paused(address)                            CL, Bin, ProtocolFees
 *   ProtocolFeeControllerUpdated(address)      CL, Bin, ProtocolFees
 *   ProtocolFeeUpdated(bytes32,uint24)         CL, Bin, ProtocolFees
 *   Unpaused(address)                          CL, Bin, ProtocolFees
 *
 * `Swap` and `Initialize` happen not to collide - CL and Bin carry different
 * parameter types - but nothing guarantees that stays true. Every query below is
 * therefore scoped by emitting ADDRESS (`target: <one pool manager>`), never by a
 * bare topic filter, and each target is decoded with its OWN abi. A `noTarget`
 * scan keyed on topic0 alone would silently merge CL and Bin activity, and would
 * pick up a third contract's `ProtocolFeeUpdated` for free.
 *
 * ---------------------------------------------------------------------------
 * FEE MODEL - derived from the contracts, not from docs
 * ---------------------------------------------------------------------------
 * `Swap` carries `fee` (uint24) and `protocolFee` (uint16), both in pips (1e-6):
 *
 *   fee          `SwapState.swapFee` - the TOTAL rate charged on the gross input,
 *                protocol fee included.
 *   protocolFee  the SINGLE-DIRECTION protocol fee, already resolved for this
 *                swap's direction before the swap loop ran.
 *
 * The protocol fee is taken off the input FIRST and the LP fee applies to the
 * remainder, so the two compose rather than add
 * (`ProtocolFeeLibrary.calculateSwapFee`):
 *
 *   fee = protocolFee + lpFee - (protocolFee * lpFee / 1e6)
 *
 * Which means the amounts decompose exactly, with no need to recover `lpFee`:
 *
 *   totalFee    = grossInput * fee              / 1e6
 *   protocolCut = grossInput * protocolFee      / 1e6
 *   lpCut       = grossInput * (fee-protocolFee)/ 1e6
 *
 * `protocolCut` matches `CLPool.swap`, which accrues
 * `(step.amountIn + step.feeAmount) * protocolFee / 1e6` per step, and matches
 * `BinPool.swap`, which reaches the same number the long way round through
 * `PackedUint128Math.getProtocolFeeAmt` (`totalFee * protocolFee / swapFee`).
 *
 * Because the fee is charged on the input leg only, the strictly correct thing is
 * to book it in the input token. We instead apply the same RATE to whichever leg
 * `addOneToken` prices, exactly as the pancakeswap-infinity adapter does: the two
 * legs of a swap differ only by the fee itself and price impact, so the USD value
 * is the same to within that, and pricing off the core asset avoids a thin
 * long-tail token setting the number. All three balances use `addOneToken` with
 * the same (token0, token1), so they always land on the same leg and the identity
 * `Fees = Revenue + SupplySideRevenue` holds per swap.
 *
 * NATIVE CURRENCY. A pool in the chain's native coin has `currency0 = address(0)`
 * (the zero address sorts first). Upstream `helpers/coreAssets.json` does NOT list
 * the zero address as a core asset on most chains - not on `base` or `ethereum`
 * (read 2026-09-28) - so `addOneToken(currency0 = native, currency1 = launch token)`
 * would book the LAUNCH TOKEN leg, which nothing prices, and the swap would vanish
 * from volume. Every DeepCore launch quoted in ETH is such a pool. `orderLegs` below
 * therefore hands a native pool to `addOneToken` with the legs swapped: a core
 * ERC-20 on the other side still wins, otherwise the native leg is booked. This is
 * the preference `dexs/uniswap-v4.ts` applies inline ("price via the native coin").
 *
 * ROUTED FILLS. `DeepCoreFillRouter` may fill a trade on a third-party AMM and charge a
 * fee on the input it actually consumed. Its `Filled` event states that fee (`feeAmount`,
 * in `currencyIn`) separately from the trade, so it is read directly and counted as Fees
 * and Revenue (the immutable fee recipient is the protocol). The routed trade itself is
 * NOT volume here: it happened on another venue's pool. A fill into DeepCore's own
 * router is fee-exempt on chain (0), and its swap is already in the pool managers'
 * `Swap` logs, so nothing is counted twice.
 *
 * LAUNCH POOLS ARE NOT SPECIAL-CASED, ON PURPOSE. A pool made through DeepCore's launch
 * kit carries a launch-guard hook that takes a creator tax and part of the trade fee
 * itself, outside `Swap.fee` (`TaxTaken` / `FeeTaken`). Those amounts are NOT read by
 * this adapter and are counted nowhere - not in Fees, not in Revenue - until a real
 * launch on a live chain has proven the guards' events against the contracts. Until
 * then a launch pool is treated like any other pool: its `Swap` volume and `Swap.fee`
 * are counted, and the LP part of `Swap.fee` is supply-side revenue. This understates
 * launch-pool fees; it never overstates them.
 */


// ---------------------------------------------------------------------------
// Deployment registry. Adding a chain is one entry here and nothing else.
//
// Every address below was read from DeepCore's address book and checked on chain.
// DeepCore uses the same addresses on every chain. `fromBlock` is the block of the
// CLPoolManager deployment receipt on that chain (BinPoolManager follows it), the
// floor for the Initialize scan; `start` is that block's UTC date.
//
// THE CORE PROTOCOL FEE IS READ PER SWAP, NEVER FROM CONFIGURATION. Its share of
// `dailyRevenue` is the `protocolFee` each `Swap` actually carried; nothing here
// reads the fee controller. A later change of controller or rate is reported
// correctly without a change to this file.
// ---------------------------------------------------------------------------
export interface DeepCoreChainConfig {
  /** Singleton custodian of every token. Used by the TVL adapter, not here. */
  vault: string;
  /** Concentrated-liquidity pool manager. */
  clPoolManager: string;
  /** Liquidity-book pool manager. */
  binPoolManager: string;
  /** `DeepCoreFillRouter`, whose `Filled` events carry the routing fee. Optional. */
  fillRouter?: string;
  /** Block of the CLPoolManager deployment - the floor for the Initialize scan. */
  fromBlock: number;
  /** First date that returns data. */
  start: string;
  /**
   * Tokens whose swaps are dropped entirely. Two sources, merged: DefiLlama's
   * central spam list for the chain, and `DEEPCORE_TEST_TOKENS` below.
   */
  blacklistTokens?: string[];
}

/**
 * Tokens with no economic meaning by construction (e.g. a protocol's own test
 * tokens), per chain slug, whose swaps are dropped entirely. Empty: DeepCore has
 * no test tokens on any chain it is deployed to. This is NOT where to put a token
 * that is real but thinly traded.
 *
 * Mirrored in DefiLlama-Adapters/projects/deepcore/config.js as
 * `DEEPCORE_TEST_TOKENS`; keep the two lists identical.
 */
export const DEEPCORE_TEST_TOKENS: Record<string, string[]> = {};

const VAULT = "0x405515DB94aDBF3A827349f2C096809639581D09";
const CL_POOL_MANAGER = "0xE23978EBBf83Eab3f0226674d1183b5D3ED32FeC";
const BIN_POOL_MANAGER = "0x004a786C4cB79358e2f86467B0eBFD87028648F4";
const FILL_ROUTER = "0x7878624417E9d69219EAdD14bA1B01459C87b578";

export const chainConfig: Record<string, DeepCoreChainConfig> = {
  // HyperEVM, chain id 999. DefiLlama's slug for it is "hyperliquid".
  [CHAIN.HYPERLIQUID]: {
    vault: VAULT,
    clPoolManager: CL_POOL_MANAGER,
    binPoolManager: BIN_POOL_MANAGER,
    fillRouter: FILL_ROUTER,
    fromBlock: 48129462,
    start: "2026-10-10",
  },
  // BNB Chain, chain id 56.
  [CHAIN.BSC]: {
    vault: VAULT,
    clPoolManager: CL_POOL_MANAGER,
    binPoolManager: BIN_POOL_MANAGER,
    fillRouter: FILL_ROUTER,
    fromBlock: 126766127,
    start: "2026-10-10",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BSC),
  },
  // Base, chain id 8453.
  [CHAIN.BASE]: {
    vault: VAULT,
    clPoolManager: CL_POOL_MANAGER,
    binPoolManager: BIN_POOL_MANAGER,
    fillRouter: FILL_ROUTER,
    fromBlock: 52409470,
    start: "2026-10-10",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BASE),
  },
  // Robinhood Chain, chain id 4663.
  [CHAIN.ROBINHOOD]: {
    vault: VAULT,
    clPoolManager: CL_POOL_MANAGER,
    binPoolManager: BIN_POOL_MANAGER,
    fillRouter: FILL_ROUTER,
    fromBlock: 84732137,
    start: "2026-10-10",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.ROBINHOOD),
  },
};

/** A chain is live once it has a vault, at least one pool manager and a start date. */
export const isConfigured = (c?: DeepCoreChainConfig): c is DeepCoreChainConfig =>
  Boolean(c && c.vault && (c.clPoolManager || c.binPoolManager) && c.start);

// ---------------------------------------------------------------------------
// Events. Copied verbatim from the compiled ABIs.
// ---------------------------------------------------------------------------
export const CL_INITIALIZE_EVENT =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint160 sqrtPriceX96, int24 tick)";
export const BIN_INITIALIZE_EVENT =
  "event Initialize(bytes32 indexed id, address indexed currency0, address indexed currency1, address hooks, uint24 fee, bytes32 parameters, uint24 activeId)";
export const CL_SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee, uint16 protocolFee)";
export const BIN_SWAP_EVENT =
  "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint24 activeId, uint24 fee, uint16 protocolFee)";
/** `DeepCoreFillRouter.Filled`. `feeAmount` is in `currencyIn`; `address(0)` is native. */
export const FILLED_EVENT =
  "event Filled(address indexed payer, address indexed target, address indexed recipient, address currencyIn, address currencyOut, uint256 amountIn, uint256 spent, uint256 feeAmount, uint256 amountOut, uint256 refund)";

/** `ProtocolFeeLibrary.PIPS_DENOMINATOR`. */
const PIPS = 1_000_000n;

/** How native currency appears in a pool key. */
const NATIVE: string = ADDRESSES.null;

/**
 * The (token0, amount0, token1, amount1) to hand `addOneToken` for one swap.
 *
 * `addOneToken` books token0 only when token0 is a core asset, else token1. For a
 * native pool (`currency0 == address(0)`) that would book the other leg whenever
 * upstream's coreAssets lacks the zero address - see NATIVE CURRENCY in the header.
 * Swapping the legs keeps every other preference intact: a core ERC-20 opposite the
 * native coin still wins, and otherwise the native leg is booked.
 */
export function orderLegs<T>(
  currency0: string,
  amount0: T,
  currency1: string,
  amount1: T,
): { token0: string; amount0: T; token1: string; amount1: T } {
  return currency0.toLowerCase() === NATIVE
    ? { token0: currency1, amount0: amount1, token1: currency0, amount1: amount0 }
    : { token0: currency0, amount0, token1: currency1, amount1 };
}

export const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  LP_REVENUE: "Swap Fees To Liquidity Providers",
  PROTOCOL_REVENUE: "Swap Fees To Protocol",
  ROUTING_FEES: "Routing Fees",
  ROUTING_FEES_TO_PROTOCOL: "Routing Fees To Protocol",
};

const abs = (v: bigint): bigint => (v < 0n ? -v : v);

/**
 * Split one swap's fee.
 *
 * `gross` is the magnitude of the leg being priced. `fee` is the total rate and
 * `protocolFee` the protocol's slice of it, both in pips of the same base, so the
 * two subtract cleanly. Exported for unit testing against the Solidity libraries.
 */
export function splitSwapFee(
  gross: bigint,
  fee: bigint,
  protocolFee: bigint,
): { total: bigint; protocol: bigint; lp: bigint } {
  if (gross <= 0n || fee <= 0n) return { total: 0n, protocol: 0n, lp: 0n };
  // Only the low 12 bits are the single-direction fee (ProtocolFeeLibrary).
  const p = protocolFee & 0xfffn;
  const total = (gross * fee) / PIPS;
  // A protocolFee above the total swap fee is impossible on-chain; guard anyway so
  // a malformed log can never produce a negative supply-side number.
  const protocol = p >= fee ? total : (gross * p) / PIPS;
  return { total, protocol, lp: total - protocol };
}

/**
 * Unpack a `bytes32` written by `PackedUint128Math.encode(x1, x2)`.
 *
 *   encode  z := or(and(x1, MASK_128), shl(128, x2))
 *   decode  x1 := and(z, MASK_128) ; x2 := shr(128, z)
 *
 * so the LOW 128 bits are x1 (currency0) and the HIGH 128 bits are x2 (currency1),
 * as `BinPoolManager` pins with `decodeX()` / `decodeY()`. Not used by the swap
 * path - bin `Swap` carries plain `int128 amount0/amount1`; it is here for whoever
 * extends this adapter to bin `Mint`/`Burn` liquidity flow.
 *
 * @returns `[amount0, amount1]`
 */
export function decodePackedUint128(word: string): [bigint, bigint] {
  const hex = word.replace(/^0[xX]/, "");
  if (!/^[0-9a-fA-F]{1,64}$/.test(hex))
    throw new Error(`decodePackedUint128: not a bytes32 word: ${word}`);
  const z = BigInt("0x" + hex);
  return [z & ((1n << 128n) - 1n), z >> 128n];
}

type Bal = ReturnType<FetchOptions["createBalances"]>;

interface Pool {
  currency0: string;
  currency1: string;
}

/** Adds one swap's leg-ordered amount pair to each balance (the same leg every time). */
function addLeg(chain: string, targets: Bal[], pool: Pool, a0: bigint, a1: bigint, label?: string) {
  for (const balances of targets)
    addOneToken({ chain, balances, ...orderLegs(pool.currency0, a0, pool.currency1, a1), label });
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  if (!isConfigured(config))
    throw new Error(`DeepCore: no deployment configured for chain ${options.chain}`);
  const { chain, getLogs } = options;

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  // Twins are filled side by side rather than cloned, so each keeps its labels.
  const fees = [dailyFees, dailyUserFees];
  const revenue = [dailyRevenue, dailyProtocolRevenue];

  const blacklist = new Set((config.blacklistTokens ?? []).map((t) => t.toLowerCase()));
  const excluded = (p: Pool) =>
    blacklist.has(p.currency0.toLowerCase()) || blacklist.has(p.currency1.toLowerCase());

  const managers: Array<{ target: string; initializeAbi: string; swapAbi: string }> = [];
  if (config.clPoolManager)
    managers.push({ target: config.clPoolManager, initializeAbi: CL_INITIALIZE_EVENT, swapAbi: CL_SWAP_EVENT });
  if (config.binPoolManager)
    managers.push({ target: config.binPoolManager, initializeAbi: BIN_INITIALIZE_EVENT, swapAbi: BIN_SWAP_EVENT });

  // ---- 1. swaps on DeepCore pools: volume, and the fee in `Swap.fee` ----
  for (const m of managers) {
    // Pool id -> pool, scanned from the deployment block: small, slowly-changing
    // config data, which is what cacheInCloud is for. Per manager, so a CL pool id
    // is never resolved with a Bin pool's currencies.
    const initLogs = await getLogs({ target: m.target, fromBlock: config.fromBlock, eventAbi: m.initializeAbi, cacheInCloud: true });
    const pools: Record<string, Pool> = {};
    for (const log of initLogs)
      pools[String(log.id).toLowerCase()] = { currency0: String(log.currency0), currency1: String(log.currency1) };

    const swapLogs = await getLogs({ target: m.target, eventAbi: m.swapAbi });
    for (const log of swapLogs) {
      const pool = pools[String(log.id).toLowerCase()];
      // A Swap for a pool this manager never initialized cannot be attributed to a
      // token pair. Dropping it is the only safe option - it is not a zero.
      if (!pool || excluded(pool)) continue;

      const amount0 = abs(BigInt(log.amount0));
      const amount1 = abs(BigInt(log.amount1));
      const fee = BigInt(log.fee);
      const protocolFee = BigInt(log.protocolFee);
      const s0 = splitSwapFee(amount0, fee, protocolFee);
      const s1 = splitSwapFee(amount1, fee, protocolFee);

      // One side of the swap only, gross of fees.
      addLeg(chain, [dailyVolume], pool, amount0, amount1);
      addLeg(chain, fees, pool, s0.total, s1.total, METRIC.SWAP_FEES);
      addLeg(chain, revenue, pool, s0.protocol, s1.protocol, METRIC.PROTOCOL_REVENUE);
      addLeg(chain, [dailySupplySideRevenue], pool, s0.lp, s1.lp, METRIC.LP_REVENUE);
    }
  }

  // ---- 2. routed fills: the router's fee only, never the routed volume ----
  if (config.fillRouter) {
    const filled = await getLogs({ target: config.fillRouter, eventAbi: FILLED_EVENT });
    for (const log of filled) {
      const currencyIn = String(log.currencyIn);
      if (blacklist.has(currencyIn.toLowerCase())) continue;
      const feeAmount = BigInt(log.feeAmount);
      if (feeAmount <= 0n) continue; // a fee-exempt venue (DeepCore's own router) pays 0
      for (const b of fees) b.add(currencyIn, feeAmount, METRIC.ROUTING_FEES);
      for (const b of revenue) b.add(currencyIn, feeAmount, METRIC.ROUTING_FEES_TO_PROTOCOL);
    }
  }

  // Income statement.
  //
  // dailyFees / dailyUserFees  what traders paid: each DeepCore pool's swap fee
  //                            (Swap.fee, core protocol fee included) and the
  //                            router's fee on routed fills.
  // dailyRevenue / ProtocolRev the core protocol fee each Swap carried, and the
  //                            router fee.
  // dailySupplySideRevenue     the LP part of Swap.fee.
  // dailyHoldersRevenue        omitted: no token holder receives protocol revenue.
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // Swap and Filled logs are window-scoped, so an hourly pull is exact and cheap.
  pullHourly: true,
  fetch,
  adapter: {},
  methodology: {
    Volume:
      "Gross input of every swap on DeepCore's CLPoolManager and BinPoolManager, one leg per swap, read from Swap events. Trades the DeepCore router fills on other venues are not counted as volume.",
    Fees: "Swap fees charged by DeepCore pools, read from each Swap event (protocol fee included), plus the fee DeepCore's router charges on fills it routes to other venues, read from its Filled events. Launch-pool creator taxes and launch-guard trade fees are not counted.",
    UserFees: "Same as Fees - traders pay all of it.",
    Revenue:
      "The protocol fee slice each Swap event carried, plus the router fee on routed fills. Both are paid to the protocol.",
    ProtocolRevenue: "All of Revenue goes to the protocol.",
    SupplySideRevenue: "The rest of each swap fee, earned by liquidity providers.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fee charged by the pool, read from each Swap event.",
      [METRIC.ROUTING_FEES]: "Fee charged by DeepCore's router on a fill routed to another venue (Filled.feeAmount).",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fee charged by the pool, read from each Swap event.",
      [METRIC.ROUTING_FEES]: "Fee charged by DeepCore's router on a fill routed to another venue (Filled.feeAmount).",
    },
    Revenue: {
      [METRIC.PROTOCOL_REVENUE]: "Protocol fee slice of the swap fee, at the rate each Swap event carried on chain.",
      [METRIC.ROUTING_FEES_TO_PROTOCOL]: "Router fee on routed fills, paid to the protocol.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: "Protocol fee slice of the swap fee, at the rate each Swap event carried on chain.",
      [METRIC.ROUTING_FEES_TO_PROTOCOL]: "Router fee on routed fills, paid to the protocol.",
    },
    SupplySideRevenue: {
      [METRIC.LP_REVENUE]: "Swap fee remaining after the protocol slice, earned by liquidity providers.",
    },
  },
};

// Only chains with a real deployment are exported.
for (const [chain, config] of Object.entries(chainConfig)) {
  if (isConfigured(config)) (adapter.adapter as BaseAdapter)[chain] = { start: config.start };
}

export default adapter;
