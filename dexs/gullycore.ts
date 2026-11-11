import { FetchOptions, SimpleAdapter } from "../adapters/types";
import ADDRESSES from "../helpers/coreAssets.json";
// BEGIN GENERATED IMPORTS (tools/sync-records.mjs)
import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
// END GENERATED IMPORTS
import { addOneToken } from "../helpers/prices";

/**
 * Gully Core - swap volume, swap fees and the LP/protocol split.
 *
 * Gully Core is a Uniswap-v4-style singleton AMM forked from PancakeSwap Infinity. A
 * single `Vault` custodies every token; two pool managers register against it as
 * "apps" and hold nothing themselves:
 *
 *   CLPoolManager   concentrated liquidity
 *   BinPoolManager  liquidity book / bins
 *
 * Both emit their own `Swap`, and both carry the same two fee numbers, so one
 * code path covers them. See `FEE MODEL` below.
 *
 * Website: https://gullycore.xyz  (docs: https://docs.gullycore.xyz)
 * GitHub:  https://github.com/gully-labs
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
 * from volume. Every Gully Core launch quoted in ETH is such a pool. `orderLegs` below
 * therefore hands a native pool to `addOneToken` with the legs swapped: a core
 * ERC-20 on the other side still wins, otherwise the native leg is booked. This is
 * the preference `dexs/uniswap-v4.ts` applies inline ("price via the native coin").
 *
 * WRAPPED NATIVE. On Elysium, Gully Core's pools are quoted in its own WETH9-bytecode
 * wrapped HYPE, a contract the coins service has no price for (the chain's listed
 * WHYPE is a different deployment). A chain row names it as `wrappedNative`, and every
 * amount in it is booked as the native coin it redeems 1:1 for (`pricedAs`), before the
 * leg ordering above, so such a pool is treated exactly like a native pool.
 *
 * ROUTED FILLS. `GullyCoreFillRouter` may fill a trade on a third-party AMM and charge a
 * fee on the input it actually consumed. Its `Filled` event states that fee (`feeAmount`,
 * in `currencyIn`) separately from the trade, so it is read directly and counted as Fees
 * and Revenue (the immutable fee recipient is the protocol). The routed trade itself is
 * NOT volume here: it happened on another venue's pool. A fill into Gully Core's own
 * router is fee-exempt on chain (0), and its swap is already in the pool managers'
 * `Swap` logs, so nothing is counted twice.
 *
 * LAUNCH POOLS. A pool made through Gully Core's launch kit carries a launch-guard hook that takes a
 * trade fee (`FeeTaken`) and a creator tax (`TaxTaken`) itself, in the quote currency, outside
 * `Swap.fee`. Both are read from the guard's own events, each pool's split is read once from the guard
 * (`getFeeSplit`, `getTax`), and the amounts are divided exactly as `LaunchTaxModule._credit` divides
 * them (`splitGuardAmount`). The launch fee comes from the kit's `LaunchCreated`. Nothing here knows a
 * rate: an outside launchpad's pool carries a split with no protocol share, so the guard adds no
 * revenue for it, and Gully's own surfaces carry their own split. A split that cannot be read is never
 * guessed: the amount is Fees and supply side, labelled "Launch Fees With Unread Split", and not Revenue.
 * Only the guards and kits named in the deployment table are read, never a hook a pool names.
 */


// ---------------------------------------------------------------------------
// Deployment table. It is generated from Gully Core's deployment records
// (`npm run sync -- --records <gully-ops>/l3/generated`) and from nothing else: no address is
// written by hand, and a chain with no record is not exported. `fromBlock` is the first block
// where the Vault has code, `start` is that block's UTC date.
//
// THE CORE PROTOCOL FEE IS READ PER SWAP, NEVER FROM CONFIGURATION. Its share of
// `dailyRevenue` is the `protocolFee` each `Swap` actually carried; nothing here
// reads the fee controller. A later change of controller or rate is reported
// correctly without a change to this file.
// ---------------------------------------------------------------------------
export interface GullyCoreChainConfig {
  /** Singleton custodian of every token. Used by the TVL adapter, not here. */
  vault: string;
  /** Concentrated-liquidity pool manager. */
  clPoolManager: string;
  /** Liquidity-book pool manager. */
  binPoolManager: string;
  /** `GullyCoreFillRouter`, whose `Filled` events carry the routing fee. Optional. */
  fillRouter?: string;
  /** Every launch guard of the record, current and retired: the only hooks read for guard fees. */
  launchGuards?: string[];
  /** Every launchpad kit of the record, current and retired: the only contracts read for launch fees. */
  launchKits?: string[];
  /** Block of the Vault's first code - the floor for the Initialize scan. */
  fromBlock: number;
  /** First date that returns data. */
  start: string;
  /**
   * Tokens whose swaps are dropped entirely. Two sources, merged: DefiLlama's
   * central spam list for the chain, and `GULLYCORE_TEST_TOKENS` below.
   */
  blacklistTokens?: string[];
  /**
   * The WETH9-style wrapped native coin Gully Core's pools are quoted in on this chain, where the coins
   * service has no price for that contract (Elysium: Gully Core's own wrapped HYPE deployment). It is
   * redeemable 1:1, so its amounts are booked as the native coin. Unset where the wrapped coin is priced.
   */
  wrappedNative?: string;
}

/**
 * Tokens with no economic meaning by construction (e.g. a protocol's own test
 * tokens), per chain slug, whose swaps are dropped entirely. Empty: Gully Core has
 * no test tokens on any chain it is deployed to. This is NOT where to put a token
 * that is real but thinly traded.
 *
 * Mirrored in DefiLlama-Adapters/projects/gullycore/config.js as
 * `GULLYCORE_TEST_TOKENS`; keep the two lists identical.
 */
export const GULLYCORE_TEST_TOKENS: Record<string, string[]> = {};

// BEGIN GENERATED DEPLOYMENTS (tools/sync-records.mjs)
export const chainConfig: Record<string, GullyCoreChainConfig> = {
  [CHAIN.BSC]: {
    vault: "0x90c882D9C307c2bF7E961bC279b0929f92997dD4",
    clPoolManager: "0x6D0721230b6beD4bc9eeb65E200B6f90c2C9aEE6",
    binPoolManager: "0x4255B0B14F3dd4e2350954Da78707E3fA6c94E2B",
    fillRouter: "0x7577aEcB9862a7a6022Dcf1D3a3623ED91EdD9c6",
    launchGuards: ["0x9D3B43CD5c5df9810B044b0694669b206646A70E", "0xB4553D0e24E4d541c620612A99c816a89aA4f30A"],
    launchKits: ["0xb204c2c6CB7Ad0758Fa90B73E1B0e2405A510636"],
    fromBlock: 132456409,
    start: "2026-11-08",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BSC),
  },
  [CHAIN.ROBINHOOD]: {
    vault: "0x90c882D9C307c2bF7E961bC279b0929f92997dD4",
    clPoolManager: "0x6D0721230b6beD4bc9eeb65E200B6f90c2C9aEE6",
    binPoolManager: "0x4255B0B14F3dd4e2350954Da78707E3fA6c94E2B",
    fillRouter: "0x7577aEcB9862a7a6022Dcf1D3a3623ED91EdD9c6",
    launchGuards: ["0x9D3B43CD5c5df9810B044b0694669b206646A70E", "0xB4553D0e24E4d541c620612A99c816a89aA4f30A"],
    launchKits: ["0xb204c2c6CB7Ad0758Fa90B73E1B0e2405A510636"],
    fromBlock: 109466287,
    start: "2026-11-08",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.ROBINHOOD),
  },
  [CHAIN.ANUBI]: {
    vault: "0x080afe8C30e48e126e9EFAd6F455BaF53c16Ec91",
    clPoolManager: "0xC85Edc14Fc6053151066f6D497B11E6982946a50",
    binPoolManager: "0x4f5c8F759912BbcE685B2315136615Bb13DDe509",
    fillRouter: "0x40f2a66CaBFa88380a47A1f9368Bb0896Fc6FAB8",
    launchGuards: ["0x24E6fc761907293336521C5bf9658B04F80275dd", "0xC456f2870c38131823d165F53b52954c6B275313"],
    launchKits: ["0xb0BBe5b05A97Bd57DccF3fBd9CF420483b441a23"],
    fromBlock: 18483713,
    start: "2026-11-07",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.ANUBI),
  },
  [CHAIN.BASE]: {
    vault: "0x90c882D9C307c2bF7E961bC279b0929f92997dD4",
    clPoolManager: "0x6D0721230b6beD4bc9eeb65E200B6f90c2C9aEE6",
    binPoolManager: "0x4255B0B14F3dd4e2350954Da78707E3fA6c94E2B",
    fillRouter: "0x7577aEcB9862a7a6022Dcf1D3a3623ED91EdD9c6",
    launchGuards: ["0x9D3B43CD5c5df9810B044b0694669b206646A70E", "0xB4553D0e24E4d541c620612A99c816a89aA4f30A"],
    launchKits: ["0xb204c2c6CB7Ad0758Fa90B73E1B0e2405A510636"],
    fromBlock: 54386424,
    start: "2026-11-07",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BASE),
  },
  [CHAIN.ELYSIUM]: {
    vault: "0x90c882D9C307c2bF7E961bC279b0929f92997dD4",
    clPoolManager: "0x6D0721230b6beD4bc9eeb65E200B6f90c2C9aEE6",
    binPoolManager: "0x4255B0B14F3dd4e2350954Da78707E3fA6c94E2B",
    fillRouter: "0x7577aEcB9862a7a6022Dcf1D3a3623ED91EdD9c6",
    launchGuards: ["0x9D3B43CD5c5df9810B044b0694669b206646A70E", "0xB4553D0e24E4d541c620612A99c816a89aA4f30A"],
    launchKits: ["0xb204c2c6CB7Ad0758Fa90B73E1B0e2405A510636"],
    fromBlock: 2834807,
    start: "2026-11-09",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.ELYSIUM),
    wrappedNative: "0xceeB06009b870430aC2872e3ba875aB6A9AB6699",
  },
};
// END GENERATED DEPLOYMENTS

/** A chain is live once it has a vault, at least one pool manager and a start date. */
export const isConfigured = (c?: GullyCoreChainConfig): c is GullyCoreChainConfig =>
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
/** `GullyCoreFillRouter.Filled`. `feeAmount` is in `currencyIn`; `address(0)` is native. */
export const FILLED_EVENT =
  "event Filled(address indexed payer, address indexed target, address indexed recipient, address currencyIn, address currencyOut, uint256 amountIn, uint256 spent, uint256 feeAmount, uint256 amountOut, uint256 refund)";

/** `LaunchTaxModule`: a swap paid `amount` of the quote into the pool's FEE pot. */
export const FEE_TAKEN_EVENT =
  "event FeeTaken(bytes32 indexed poolId, address indexed currency, bool isBuy, uint256 amount)";
/** `LaunchTaxModule`: a swap paid `amount` of the quote into the pool's TAX pot. */
export const TAX_TAKEN_EVENT =
  "event TaxTaken(bytes32 indexed poolId, address indexed currency, bool isBuy, uint256 amount)";
/** `LaunchpadKitV2`: the launch fee is in the chain's native coin (`address(0)`). */
export const LAUNCH_CREATED_EVENT =
  "event LaunchCreated(address indexed token, address indexed creator, address indexed tenant, address launcher, address operator, uint256 totalSupply, uint256 seedSupply, uint8 legCount, uint40 startTime, uint256 protocolFeeWei, address integrator, uint256 integratorFeeWei)";
/** A pool's fee split, written once at launch. */
export const GET_FEE_SPLIT =
  "function getFeeSplit(bytes32 poolId) view returns ((address creator, uint16 creatorBps, uint16 protocolBps, uint16 integratorBps, address integrator))";
/** A pool's tax terms, written once at launch. */
export const GET_TAX =
  "function getTax(bytes32 poolId) view returns ((address creator, uint16 buyBps, uint16 sellBps, uint40 expiresAt, uint16 creatorBps, address integrator, uint16 protocolBps, uint16 integratorBps))";

/** `LaunchTaxModule.BPS`. */
const BPS = 10_000n;

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
  LAUNCH_TRADE_FEES: "Launch Trade Fees",
  LAUNCH_TRADE_FEES_TO_PROTOCOL: "Launch Trade Fees To Protocol",
  LAUNCH_TRADE_FEES_TO_CREATORS: "Launch Trade Fees To Creators",
  LAUNCH_TRADE_FEES_TO_LAUNCHPADS: "Launch Trade Fees To Launchpads",
  CREATOR_TAX: "Creator Tax",
  CREATOR_TAX_TO_PROTOCOL: "Creator Tax To Protocol",
  CREATOR_TAX_TO_CREATORS: "Creator Tax To Creators",
  CREATOR_TAX_TO_LAUNCHPADS: "Creator Tax To Launchpads",
  LAUNCH_FEES: "Launch Fees",
  LAUNCH_FEES_TO_PROTOCOL: "Launch Fees To Protocol",
  LAUNCH_FEES_TO_LAUNCHPADS: "Launch Fees To Launchpads",
  LAUNCH_UNREAD: "Launch Fees With Unread Split",
};

/**
 * Divide one guard amount exactly as `LaunchTaxModule._credit` does.
 *
 * The creator and the launchpad get their basis points rounded down, the protocol gets the rest.
 * When the split names no protocol share (`creatorBps + integratorBps == 10000`) the protocol gets
 * NOTHING, not even a rounding unit: the remainder goes to the creator, or to the launchpad when the
 * creator has no share. That is the outside-launchpad rule (a flat 0.30% in `Swap.fee` and nothing
 * else), so an outside launch adds no guard revenue.
 */
export function splitGuardAmount(
  pot: bigint,
  split: { creatorBps: number | bigint; integratorBps: number | bigint; protocolBps?: number | bigint },
): { creator: bigint; integrator: bigint; protocol: bigint } {
  const creatorBps = BigInt(split.creatorBps);
  const integratorBps = BigInt(split.integratorBps);
  let creator = (pot * creatorBps) / BPS;
  let integrator = (pot * integratorBps) / BPS;
  let protocol = 0n;
  if (creatorBps + integratorBps === BPS) {
    if (creatorBps !== 0n) creator = pot - integrator;
    else integrator = pot;
  } else {
    protocol = pot - creator - integrator;
  }
  return { creator, integrator, protocol };
}

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

/**
 * The address an amount is priced under. The chain's unpriced wrapped native coin (`wrappedNative`)
 * is booked as the native coin it redeems 1:1 for; every other token is itself. Applied before
 * `orderLegs`, so a pool quoted in wrapped HYPE gets the native-pool leg preference.
 */
const pricedAs = (wrappedNative?: string) => {
  const wrapped = wrappedNative?.toLowerCase();
  return (token: string): string => (wrapped && token.toLowerCase() === wrapped ? NATIVE : token);
};

const FEE_LABELS = {
  total: METRIC.LAUNCH_TRADE_FEES,
  protocol: METRIC.LAUNCH_TRADE_FEES_TO_PROTOCOL,
  creator: METRIC.LAUNCH_TRADE_FEES_TO_CREATORS,
  launchpad: METRIC.LAUNCH_TRADE_FEES_TO_LAUNCHPADS,
};
const TAX_LABELS = {
  total: METRIC.CREATOR_TAX,
  protocol: METRIC.CREATOR_TAX_TO_PROTOCOL,
  creator: METRIC.CREATOR_TAX_TO_CREATORS,
  launchpad: METRIC.CREATOR_TAX_TO_LAUNCHPADS,
};

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  if (!isConfigured(config))
    throw new Error(`Gully Core: no deployment configured for chain ${options.chain}`);
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
  const priced = pricedAs(config.wrappedNative);
  const pricedPool = (p: Pool): Pool => ({ currency0: priced(p.currency0), currency1: priced(p.currency1) });

  const managers: Array<{ target: string; initializeAbi: string; swapAbi: string }> = [];
  if (config.clPoolManager)
    managers.push({ target: config.clPoolManager, initializeAbi: CL_INITIALIZE_EVENT, swapAbi: CL_SWAP_EVENT });
  if (config.binPoolManager)
    managers.push({ target: config.binPoolManager, initializeAbi: BIN_INITIALIZE_EVENT, swapAbi: BIN_SWAP_EVENT });

  // Every pool either manager initialized, by id: the guards' events are attributed through it.
  const allPools: Record<string, Pool> = {};

  // ---- 1. swaps on Gully Core pools: volume, and the fee in `Swap.fee` ----
  for (const m of managers) {
    // Pool id -> pool, scanned from the deployment block: small, slowly-changing
    // config data, which is what cacheInCloud is for. Per manager, so a CL pool id
    // is never resolved with a Bin pool's currencies.
    const initLogs = await getLogs({ target: m.target, fromBlock: config.fromBlock, eventAbi: m.initializeAbi, cacheInCloud: true });
    const pools: Record<string, Pool> = {};
    for (const log of initLogs) {
      const pool = { currency0: String(log.currency0), currency1: String(log.currency1) };
      pools[String(log.id).toLowerCase()] = pool;
      allPools[String(log.id).toLowerCase()] = pool;
    }

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
      const legs = pricedPool(pool);
      addLeg(chain, [dailyVolume], legs, amount0, amount1);
      addLeg(chain, fees, legs, s0.total, s1.total, METRIC.SWAP_FEES);
      addLeg(chain, revenue, legs, s0.protocol, s1.protocol, METRIC.PROTOCOL_REVENUE);
      addLeg(chain, [dailySupplySideRevenue], legs, s0.lp, s1.lp, METRIC.LP_REVENUE);
    }
  }

  // ---- 2. routed fills: the router's fee only, never the routed volume ----
  if (config.fillRouter) {
    const filled = await getLogs({ target: config.fillRouter, eventAbi: FILLED_EVENT });
    for (const log of filled) {
      const currencyIn = String(log.currencyIn);
      if (blacklist.has(currencyIn.toLowerCase())) continue;
      const feeAmount = BigInt(log.feeAmount);
      if (feeAmount <= 0n) continue; // a fee-exempt venue (Gully Core's own router) pays 0
      for (const b of fees) b.add(priced(currencyIn), feeAmount, METRIC.ROUTING_FEES);
      for (const b of revenue) b.add(priced(currencyIn), feeAmount, METRIC.ROUTING_FEES_TO_PROTOCOL);
    }
  }

  // ---- 3. launch pools: the guard's own fee and tax, and the kit's launch fee ----
  const guards = config.launchGuards ?? [];
  if (guards.length) {
    const kinds = [
      { logs: await getLogs({ targets: guards, eventAbi: FEE_TAKEN_EVENT, flatten: false }), abi: GET_FEE_SPLIT, labels: FEE_LABELS },
      { logs: await getLogs({ targets: guards, eventAbi: TAX_TAKEN_EVENT, flatten: false }), abi: GET_TAX, labels: TAX_LABELS },
    ];
    const splitKey = (guard: string, poolId: string) => `${guard.toLowerCase()}:${poolId}`;
    for (const kind of kinds) {
      const events = (kind.logs as any[][])
        .flatMap((logs, i) => logs.map((log) => ({ guard: guards[i], poolId: String(log.poolId).toLowerCase(), log })))
        .filter(({ poolId, log }) => allPools[poolId] && !blacklist.has(String(log.currency).toLowerCase()));
      if (!events.length) continue;
      const calls = new Map<string, { target: string; params: [string] }>();
      for (const { guard, poolId } of events) calls.set(splitKey(guard, poolId), { target: guard, params: [poolId] });
      const splits: any[] = await options.api.multiCall({
        abi: kind.abi,
        calls: [...calls.values()],
        permitFailure: true,
      });
      const splitOf = new Map<string, any>([...calls.keys()].map((k, i) => [k, splits[i]]));
      for (const { guard, poolId, log } of events) {
        const amount = BigInt(log.amount);
        if (amount <= 0n) continue;
        const currency = priced(String(log.currency));
        const split = splitOf.get(splitKey(guard, poolId));
        for (const b of fees) b.add(currency, amount, kind.labels.total);
        if (!split) {
          // Never guess a split: not revenue, and not attributed to anyone.
          dailySupplySideRevenue.add(currency, amount, METRIC.LAUNCH_UNREAD);
          continue;
        }
        const part = splitGuardAmount(amount, split);
        if (part.protocol > 0n) for (const b of revenue) b.add(currency, part.protocol, kind.labels.protocol);
        if (part.creator > 0n) dailySupplySideRevenue.add(currency, part.creator, kind.labels.creator);
        if (part.integrator > 0n) dailySupplySideRevenue.add(currency, part.integrator, kind.labels.launchpad);
      }
    }
  }

  const kits = config.launchKits ?? [];
  if (kits.length) {
    const launches = await getLogs({ targets: kits, eventAbi: LAUNCH_CREATED_EVENT });
    for (const log of launches) {
      const protocolFee = BigInt(log.protocolFeeWei);
      const launchpadFee = BigInt(log.integratorFeeWei);
      if (protocolFee + launchpadFee <= 0n) continue; // an outside launch pays Gully nothing
      for (const b of fees) b.add(NATIVE, protocolFee + launchpadFee, METRIC.LAUNCH_FEES);
      if (protocolFee > 0n) for (const b of revenue) b.add(NATIVE, protocolFee, METRIC.LAUNCH_FEES_TO_PROTOCOL);
      if (launchpadFee > 0n) dailySupplySideRevenue.add(NATIVE, launchpadFee, METRIC.LAUNCH_FEES_TO_LAUNCHPADS);
    }
  }

  // Income statement.
  //
  // dailyFees / dailyUserFees  what traders paid: each pool's swap fee (Swap.fee, core
  //                            protocol fee included), the router's fee on routed fills, the
  //                            launch guards' trade fee and creator tax, and launch fees.
  // dailyRevenue / ProtocolRev the core protocol fee each Swap carried, the router fee, and the
  //                            protocol's share of each guard amount and launch fee, as read.
  // dailySupplySideRevenue     the LP part of Swap.fee, and the creators' and launchpads' shares.
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

const feesBreakdown = {
  [METRIC.SWAP_FEES]: "Fees traders pay on every swap in Gully Core pools, at the rate recorded with each swap.",
  [METRIC.ROUTING_FEES]: "Fee Gully Core's router charges on trades it fills on other DEXs; the routed trade itself is not counted as volume.",
  [METRIC.LAUNCH_TRADE_FEES]: "Trade fee charged on buys and sells of tokens launched through Gully Core's launchpad, paid in the pool's quote token.",
  [METRIC.CREATOR_TAX]: "Buy and sell tax set by a token's creator at launch, charged on trades of that token and paid in the pool's quote token.",
  [METRIC.LAUNCH_FEES]: "Fee paid in the chain's native coin to launch a token through Gully Core's launchpad.",
};

const revenueBreakdown = {
  [METRIC.PROTOCOL_REVENUE]: "Gully Core's share of swap fees, at the protocol fee rate recorded with each swap.",
  [METRIC.ROUTING_FEES_TO_PROTOCOL]: "The full fee Gully Core's router charges on trades it fills on other DEXs, all kept by Gully Core.",
  [METRIC.LAUNCH_TRADE_FEES_TO_PROTOCOL]: "Gully Core's share of launch trade fees, as set by each pool's on-chain fee split.",
  [METRIC.CREATOR_TAX_TO_PROTOCOL]: "Gully Core's share of creator taxes, as set by each pool's on-chain tax terms.",
  [METRIC.LAUNCH_FEES_TO_PROTOCOL]: "Gully Core's part of the fee paid to launch a token.",
};

const adapter: SimpleAdapter = {
  version: 2,
  // Swap and Filled logs are window-scoped, so an hourly pull is exact and cheap.
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology: {
    Volume:
      "Value of tokens swapped in Gully Core's concentrated-liquidity and liquidity-book pools, counting one side of each trade; trades Gully Core's router sends to other DEXs are not counted.",
    Fees:
      "Swap fees paid by traders in Gully Core pools, the fee Gully Core's router charges on trades it sends to other DEXs, and the trade fees, creator taxes and launch fees paid on tokens launched through Gully Core's launchpad.",
    UserFees:
      "All swap fees, routing fees, launch trade fees, creator taxes and launch fees, paid directly by traders and by the users who launch tokens.",
    Revenue:
      "Gully Core's share of swap fees, all routing fees, and Gully Core's share of launch trade fees, creator taxes and launch fees, as set on-chain for each pool and launch.",
    ProtocolRevenue:
      "Gully Core's share of swap fees, all routing fees, and Gully Core's share of launch trade fees, creator taxes and launch fees, all kept by the protocol.",
    SupplySideRevenue:
      "The part of swap fees earned by liquidity providers, plus the shares of launch trade fees, creator taxes and launch fees paid to token creators and to the launchpads that host launches.",
  },
  breakdownMethodology: {
    Fees: feesBreakdown,
    UserFees: feesBreakdown,
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: {
      [METRIC.LP_REVENUE]: "Part of swap fees left after Gully Core's share, earned by liquidity providers.",
      [METRIC.LAUNCH_TRADE_FEES_TO_CREATORS]: "Token creators' share of launch trade fees.",
      [METRIC.LAUNCH_TRADE_FEES_TO_LAUNCHPADS]: "Share of launch trade fees paid to the launchpad that hosted the launch.",
      [METRIC.CREATOR_TAX_TO_CREATORS]: "Token creators' share of creator taxes.",
      [METRIC.CREATOR_TAX_TO_LAUNCHPADS]: "Share of creator taxes paid to the launchpad that hosted the launch.",
      [METRIC.LAUNCH_FEES_TO_LAUNCHPADS]: "Part of the launch fee paid to the launchpad that hosted the launch.",
      [METRIC.LAUNCH_UNREAD]: "Launch trade fees and creator taxes on pools whose fee split could not be read on-chain, kept out of revenue rather than guessed.",
    },
  },
};

export default adapter;
