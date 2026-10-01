import { BaseAdapter, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getDefaultDexTokensBlacklisted } from "../helpers/lists";
import { addOneToken } from "../helpers/prices";

/**
 * Latch Protocol - swap volume, swap fees and the LP/protocol split.
 *
 * Latch is a Uniswap-v4-style singleton AMM forked from PancakeSwap Infinity. A
 * single `Vault` custodies every token; two pool managers register against it as
 * "apps" and hold nothing themselves:
 *
 *   CLPoolManager   concentrated liquidity
 *   BinPoolManager  liquidity book / bins
 *
 * Both emit their own `Swap`, and both carry the same two fee numbers, so one
 * code path covers them. See `FEE MODEL` below.
 *
 * Website: https://latches.fun  (docs: https://docs.latches.fun)
 * Twitter: https://x.com/Latchesdotfun
 * GitHub:  https://github.com/Latch-Protocol-Team
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
 * from volume. Every Latch launch quoted in ETH is such a pool. `orderLegs` below
 * therefore hands a native pool to `addOneToken` with the legs swapped: a core
 * ERC-20 on the other side still wins, otherwise the native leg is booked. This is
 * the preference `dexs/uniswap-v4.ts` applies inline ("price via the native coin").
 *
 * LAUNCH POOLS. A pool made through the Latch launch kit carries a launch-guard
 * hook, and part of what its traders pay never appears in `Swap.fee`. Two guard
 * generations exist, told apart by `getHooksRegistrationBitmap()` (exact match
 * only, as Latch's SDK does):
 *
 *   lp-fee     (CL 0x08C1, Bin 0x08C5)  the trade fee is a dynamic LP-fee
 *              override, so it IS in `Swap.fee`. The creator tax is taken by the
 *              guard after the swap and is read from its `TaxTaken` events.
 *   quote-fee  (CL 0x0CC1, Bin 0x0CC5)  the guard takes the fee AND the tax itself,
 *              in the quote currency. On a buy the pool keeps
 *              floor(fee * LP_SHARE_BPS / 1e4) pips as its LP fee (in `Swap.fee`)
 *              and the guard takes the rest; on a sell the pool's fee is 0 and the
 *              guard takes all of it. The guard's part is read from `FeeTaken`.
 *
 * Only guard addresses in this file's config are read, and each is checked against
 * its listed generation before it is. Guard-taken amounts are booked in the
 * currency the event names and split by the pool's frozen split read from the
 * guard (`getTax`, `getFeeSplit`). The LP part of a launch pool's `Swap.fee` goes
 * to its permanent LP locks, which pay the protocol a share when collected; that
 * share is counted when the fee is taken, by the lock split, but only when the
 * locks provably hold all of the pool's liquidity. A split that cannot be read is
 * never assumed: the amount stays in Fees and is left out of Revenue.
 */

// ---------------------------------------------------------------------------
// Deployment registry. Adding a chain is one entry here and nothing else.
//
// Robinhood Chain (slug "robinhood") and Base (slug "base") run the same core at
// the same addresses, both deployed 2026-09-27. Every other row is a placeholder
// with empty addresses; `fetch` throws for such a chain and the export skips it,
// so an unfinished row cannot report a silent zero.
//
// THE CORE PROTOCOL FEE IS READ PER SWAP, NEVER FROM CONFIGURATION. Its share of
// `dailyRevenue` is the `protocolFee` field each `Swap` actually carried, and
// nothing here reads the fee controller. A pool's protocol fee is set when the pool is initialized and
// travels in every one of its Swap logs, so a later change of controller or rate
// is reported correctly without a change to this file. Every swap on both chains
// to date carries protocolFee 0: launch pools are set to a zero protocol fee.
// ---------------------------------------------------------------------------
export interface LatchChainConfig {
  /** Singleton custodian of every token. Used by the TVL adapter, not here. */
  vault: string;
  /** Concentrated-liquidity pool manager. */
  clPoolManager: string;
  /** Liquidity-book pool manager. */
  binPoolManager: string;
  /** Block of the first pool-manager deployment - the floor for the Initialize scan. */
  fromBlock: number;
  /** First date that returns data. */
  start: string;
  /**
   * Tokens whose swaps are dropped entirely. Two sources, merged: DefiLlama's
   * central spam list for the chain, and `LATCH_TEST_TOKENS` below.
   */
  blacklistTokens?: string[];
  /**
   * Latch's own launch guards on this chain, by generation (see LAUNCH POOLS in the
   * header). Only these addresses are ever read for `TaxTaken` / `FeeTaken`: a
   * contract that merely emits an event with the same signature is never counted.
   * Each guard's generation is CHECKED on chain against
   * `getHooksRegistrationBitmap()` before it is read; a mismatch throws.
   */
  launchGuards?: { lpFee: string[]; quoteFee: string[] };
  /** Latch's CL LP lockers, whose `PositionLocked` events carry each lock's frozen split. */
  clLPLockers?: string[];
  /** The CL position manager the lockers hold positions through (`positionManager()` on each locker). */
  clPositionManager?: string;
}

/**
 * Launch guards, lockers and position manager: the same addresses on Robinhood
 * Chain and Base. Bitmaps read on chain: the lp-fee generation 0x08C1 / 0x08C5
 * (2026-09-28; no new launches, its pools are served forever) and the quote-fee
 * generation 0x0CC1 / 0x0CC5 (deployed and read 2026-10-01, every new launch).
 */
const latchLaunchContracts = () => ({
  launchGuards: {
    lpFee: [
      "0x1978493942bDE85721d047655Cee31Ef57C0303f", // CL launch guard
      "0x19785eB03DFeFea2371cc5C5Cd7130B5D829C195", // Bin launch guard
    ],
    quoteFee: [
      "0x1978B3318dfd051F692a14A6583601aCD0C8f583", // CL launch guard (quote fee)
      "0x197865dA5A462A975DDb4aAfd9aBe097E39AD447", // Bin launch guard (quote fee)
    ],
  },
  clLPLockers: ["0x1978ECb2789423aE7fB4020dD432bc614741206c"],
  clPositionManager: "0x637A989326Fe99e9618A97f68D05621858B68973",
});

/**
 * Latch's own throwaway test tokens - "Latch Test Token One/Two", 18 decimals,
 * minted to exercise the protocol end to end on Robinhood Chain (an LTT1/LTT2
 * 0.30% pool). No pool on the current deployment contains them; the list stays so
 * that one never can be counted.
 *
 * Nothing prices them and nothing should. A swap between two such tokens has no
 * dollar volume, and the honest report of it is nothing at all - not a zero and
 * certainly not whatever a DEX-derived price feed might later infer from a dust
 * pool. `addOneToken` would otherwise hand the leg to the price server, which
 * returns no entry for either today (coins.llama.fi, 2026-09-12) and would drop
 * it; excluding by address makes that a decision rather than a coincidence.
 *
 * Mirrored in DefiLlama-Adapters/projects/latch-protocol/config.js as
 * `LATCH_TEST_TOKENS`; keep the two lists identical.
 */
export const LATCH_TEST_TOKENS: Record<string, string[]> = {
  [CHAIN.ROBINHOOD]: [
    "0x2A21c0826848f2D597B7C87A4B931dE1407958A6", // LTT1
    "0xa29927045BDFfd61B8F539D491085F1b6f7A8bE4", // LTT2
  ],
};

export const chainConfig: Record<string, LatchChainConfig> = {
  // Robinhood Chain, chain id 4663. First block with code (eth_getCode by block):
  // Vault 74031397, CL manager 74031752, Bin manager 74032103, all 2026-09-27 UTC.
  // `fromBlock` is the CL block: the earliest an Initialize can exist.
  [CHAIN.ROBINHOOD]: {
    vault: "0xaC44C903CE3d89054fD5b70e0E396f26b214CBE3",
    clPoolManager: "0x3d4afd3190b1e5036e410abb576f99c02D6fBb20",
    binPoolManager: "0xbD6274D94102C3fCafE043f8EF7C7F33f33B255A",
    fromBlock: 74031752,
    start: "2026-09-27",
    blacklistTokens: [
      ...getDefaultDexTokensBlacklisted(CHAIN.ROBINHOOD),
      ...LATCH_TEST_TOKENS[CHAIN.ROBINHOOD]!,
    ],
    ...latchLaunchContracts(),
  },
  [CHAIN.ETHEREUM]: {
    vault: "",
    clPoolManager: "",
    binPoolManager: "",
    fromBlock: 0,
    start: "",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.ETHEREUM),
  },
  // Base, chain id 8453, the same addresses. First block with code (eth_getCode by
  // block): Vault 51856682, CL manager 51856707, Bin manager 51856730, all
  // 2026-09-27 UTC.
  [CHAIN.BASE]: {
    vault: "0xaC44C903CE3d89054fD5b70e0E396f26b214CBE3",
    clPoolManager: "0x3d4afd3190b1e5036e410abb576f99c02D6fBb20",
    binPoolManager: "0xbD6274D94102C3fCafE043f8EF7C7F33f33B255A",
    fromBlock: 51856707,
    start: "2026-09-27",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BASE),
    ...latchLaunchContracts(),
  },
  [CHAIN.BSC]: {
    vault: "",
    clPoolManager: "",
    binPoolManager: "",
    fromBlock: 0,
    start: "",
    blacklistTokens: getDefaultDexTokensBlacklisted(CHAIN.BSC),
  },
  // HyperEVM, chain id 999. DefiLlama slugs it "hyperliquid".
  [CHAIN.HYPERLIQUID]: {
    vault: "",
    clPoolManager: "",
    binPoolManager: "",
    fromBlock: 0,
    start: "",
  },
  [CHAIN.MONAD]: {
    vault: "",
    clPoolManager: "",
    binPoolManager: "",
    fromBlock: 0,
    start: "",
  },
  [CHAIN.PLASMA]: {
    vault: "",
    clPoolManager: "",
    binPoolManager: "",
    fromBlock: 0,
    start: "",
  },
  [CHAIN.STABLE]: {
    vault: "",
    clPoolManager: "",
    binPoolManager: "",
    fromBlock: 0,
    start: "",
  },
};

/** A chain is live once it has a vault, at least one pool manager and a start date. */
export const isConfigured = (c?: LatchChainConfig): c is LatchChainConfig =>
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

/**
 * Launch-guard and locker events, verbatim from the compiled ABIs of
 * `LaunchTaxModule` (inherited by both launch guards) and `LatchLPLocker`, plus
 * the CL manager's `ModifyLiquidity`. `PoolId` is `bytes32`, `Currency` `address`.
 */
export const TAX_TAKEN_EVENT =
  "event TaxTaken(bytes32 indexed poolId, address indexed currency, bool isBuy, uint256 amount)";
export const FEE_TAKEN_EVENT =
  "event FeeTaken(bytes32 indexed poolId, address indexed currency, bool isBuy, uint256 amount)";
export const MODIFY_LIQUIDITY_EVENT =
  "event ModifyLiquidity(bytes32 indexed id, address indexed sender, int24 tickLower, int24 tickUpper, int256 liquidityDelta, bytes32 salt)";
export const POSITION_LOCKED_EVENT =
  "event PositionLocked(uint256 indexed tokenId, bytes32 indexed poolId, address indexed creator, address integrator, uint16 creatorBps, uint16 integratorBps, uint16 protocolBps, uint128 liquidity, address from, address operator)";
/** keccak256("ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)"), pinned by test/launchFees.test.ts. */
export const MODIFY_LIQUIDITY_TOPIC0 =
  "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";

/** `getHooksRegistrationBitmap()` of every launch guard, as the SDK's `LAUNCH_GUARD_BITMAPS`. */
export const LAUNCH_GUARD_BITMAPS = {
  lpFee: { CL: 0x08c1, Bin: 0x08c5 },
  quoteFee: { CL: 0x0cc1, Bin: 0x0cc5 },
} as const;
export type GuardGeneration = keyof typeof LAUNCH_GUARD_BITMAPS;

/** The generation a bitmap is EXACTLY (never by a single bit, as the SDK's `guardGenerationOf`), or undefined. */
export function guardGenerationOf(bitmap: number | null | undefined): GuardGeneration | undefined {
  if (bitmap === null || bitmap === undefined) return undefined;
  for (const g of Object.keys(LAUNCH_GUARD_BITMAPS) as GuardGeneration[])
    if (LAUNCH_GUARD_BITMAPS[g].CL === bitmap || LAUNCH_GUARD_BITMAPS[g].Bin === bitmap) return g;
  return undefined;
}

export const BITMAP_ABI = "function getHooksRegistrationBitmap() view returns (uint16)";
export const GET_TAX_ABI = {
  type: "function",
  name: "getTax",
  stateMutability: "view",
  inputs: [{ name: "poolId", type: "bytes32" }],
  outputs: [
    {
      name: "",
      type: "tuple",
      components: [
        { name: "creator", type: "address" },
        { name: "buyBps", type: "uint16" },
        { name: "sellBps", type: "uint16" },
        { name: "expiresAt", type: "uint40" },
        { name: "creatorBps", type: "uint16" },
        { name: "integrator", type: "address" },
        { name: "protocolBps", type: "uint16" },
        { name: "integratorBps", type: "uint16" },
      ],
    },
  ],
};
export const GET_FEE_SPLIT_ABI = {
  type: "function",
  name: "getFeeSplit",
  stateMutability: "view",
  inputs: [{ name: "poolId", type: "bytes32" }],
  outputs: [
    {
      name: "",
      type: "tuple",
      components: [
        { name: "creator", type: "address" },
        { name: "creatorBps", type: "uint16" },
        { name: "protocolBps", type: "uint16" },
        { name: "integratorBps", type: "uint16" },
        { name: "integrator", type: "address" },
      ],
    },
  ],
};

/** A three-way split in basis points, as the guards and lockers store it. */
export interface Split {
  creatorBps: bigint;
  integratorBps: bigint;
  protocolBps: bigint;
}

const BPS = 10_000n;

/**
 * The protocol's part of `amount` under `split`, exactly as the contracts credit
 * it: creator and integrator floored, the protocol takes the remainder
 * (`LaunchTaxModule._credit`, `LatchLPLocker.splitAmount`).
 */
export function protocolPart(amount: bigint, split: Split): bigint {
  return amount - (amount * split.creatorBps) / BPS - (amount * split.integratorBps) / BPS;
}

/** A split from a call result or a log, or undefined when absent or not summing to 10 000. */
function readSplit(r: any, idx: { creator: number; integrator: number; protocol: number }): Split | undefined {
  if (!r) return undefined;
  const get = (name: string, i: number) => {
    const v = r[name] ?? r[i];
    return v === undefined || v === null ? undefined : BigInt(v);
  };
  const creatorBps = get("creatorBps", idx.creator);
  const integratorBps = get("integratorBps", idx.integrator);
  const protocolBps = get("protocolBps", idx.protocol);
  if (creatorBps === undefined || integratorBps === undefined || protocolBps === undefined) return undefined;
  if (creatorBps + integratorBps + protocolBps !== BPS) return undefined;
  return { creatorBps, integratorBps, protocolBps };
}

const sameSplit = (a: Split, b: Split) =>
  a.creatorBps === b.creatorBps && a.integratorBps === b.integratorBps && a.protocolBps === b.protocolBps;

/** `ProtocolFeeLibrary.PIPS_DENOMINATOR`. */
const PIPS = 1_000_000n;

/** How native currency appears in a pool key. */
const NATIVE = "0x0000000000000000000000000000000000000000";

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
  LOCKED_LP_TO_PROTOCOL: "Locked Liquidity Fees To Protocol",
  LOCKED_LP_TO_CREATORS: "Locked Liquidity Fees To Creators And Integrators",
  LAUNCH_FEES: "Launch Trade Fees",
  LAUNCH_FEES_TO_PROTOCOL: "Launch Trade Fees To Protocol",
  LAUNCH_FEES_TO_CREATORS: "Launch Trade Fees To Creators And Integrators",
  LAUNCH_FEES_SPLIT_UNREAD: "Launch Trade Fees, Split Not Read",
  CREATOR_TAX: "Creator Tax",
  CREATOR_TAX_TO_PROTOCOL: "Creator Tax To Protocol",
  CREATOR_TAX_TO_CREATORS: "Creator Tax To Creators And Integrators",
  CREATOR_TAX_SPLIT_UNREAD: "Creator Tax, Split Not Read",
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
 * so the LOW 128 bits are x1 and the HIGH 128 bits are x2. `BinPoolManager` pins
 * which is which:
 *   protocolFeesAccrued[key.currency0] += feeAmountToProtocol.decodeX();  // low
 *   protocolFeesAccrued[key.currency1] += feeAmountToProtocol.decodeY();  // high
 *
 * Not used by the swap path - bin `Swap` carries plain `int128 amount0/amount1`.
 * It is here because bin `Mint`/`Burn` emit `bytes32[] amounts` in this encoding,
 * and anyone extending this adapter to liquidity flow will need it. Guessing the
 * packing swaps the two tokens of every bin position.
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
  /** Lower-cased; the pool's hook from its own Initialize log. */
  hooks: string;
  kind: "CL" | "Bin";
}

/** Adds one swap's leg-ordered amount pair to each balance (the same leg every time). */
function addLeg(chain: string, targets: Bal[], pool: Pool, a0: bigint, a1: bigint, label?: string) {
  for (const balances of targets)
    addOneToken({ chain, balances, ...orderLegs(pool.currency0, a0, pool.currency1, a1), label });
}

/** Adds an amount a guard took in one known currency to each balance. */
function addIn(targets: Bal[], currency: string, amount: bigint, label: string) {
  for (const balances of targets) balances.add(currency, amount, label);
}

const fetch = async (options: FetchOptions) => {
  const config = chainConfig[options.chain];
  if (!isConfigured(config))
    throw new Error(`Latch: no deployment configured for chain ${options.chain}`);
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
  const supply = [dailySupplySideRevenue];

  const blacklist = new Set((config.blacklistTokens ?? []).map((t) => t.toLowerCase()));
  const excluded = (p: Pool) =>
    blacklist.has(p.currency0.toLowerCase()) || blacklist.has(p.currency1.toLowerCase());

  const managers: Array<{ target: string; kind: "CL" | "Bin"; initializeAbi: string; swapAbi: string }> = [];
  if (config.clPoolManager)
    managers.push({ target: config.clPoolManager, kind: "CL", initializeAbi: CL_INITIALIZE_EVENT, swapAbi: CL_SWAP_EVENT });
  if (config.binPoolManager)
    managers.push({ target: config.binPoolManager, kind: "Bin", initializeAbi: BIN_INITIALIZE_EVENT, swapAbi: BIN_SWAP_EVENT });

  // Pool id -> pool, per manager. Scanned from genesis: small, slowly-changing
  // config data, which is what cacheInCloud is for. Keyed per manager so a CL pool
  // id is never resolved with a Bin pool's currencies.
  const poolsByManager = new Map<string, Record<string, Pool>>();
  for (const m of managers) {
    const initLogs = await getLogs({ target: m.target, fromBlock: config.fromBlock, eventAbi: m.initializeAbi, cacheInCloud: true });
    const map: Record<string, Pool> = {};
    for (const log of initLogs)
      map[String(log.id).toLowerCase()] = {
        currency0: String(log.currency0),
        currency1: String(log.currency1),
        hooks: String(log.hooks).toLowerCase(),
        kind: m.kind,
      };
    poolsByManager.set(m.target, map);
  }

  const guards = await resolveGuards(options, config, [...poolsByManager.values()].flatMap((m) => Object.values(m)));

  // Locked-liquidity splits of CL launch pools, resolved once per pool and only
  // for pools that swapped in the window.
  const lockSplits = new Map<string, Split | undefined>();
  let locks: Map<string, Lock[]> | undefined;
  const lockSplitOf = async (poolId: string, pool: Pool): Promise<Split | undefined> => {
    if (!lockSplits.has(poolId)) {
      let split: Split | undefined;
      if (pool.kind === "CL" && config.clPositionManager && config.clLPLockers?.length) {
        locks ??= await readLocks(getLogs, config);
        split = await soleLockSplit(getLogs, config, poolId, locks.get(poolId) ?? []);
      }
      lockSplits.set(poolId, split);
    }
    return lockSplits.get(poolId);
  };

  // ---- 1. swaps: volume, and the fee the pool itself charged (`Swap.fee`) ----
  for (const m of managers) {
    const poolMap = poolsByManager.get(m.target)!;
    const swapLogs = await getLogs({ target: m.target, eventAbi: m.swapAbi });
    for (const log of swapLogs) {
      const poolId = String(log.id).toLowerCase();
      const pool = poolMap[poolId];
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

      // The LP part. On a launch pool whose liquidity is provably all in Latch
      // locks with one split, the lock's protocol share is protocol revenue, counted
      // when the fee is taken. Otherwise all of it is LP revenue.
      const lockSplit = guards.has(pool.hooks) ? await lockSplitOf(poolId, pool) : undefined;
      if (lockSplit) {
        const p0 = protocolPart(s0.lp, lockSplit);
        const p1 = protocolPart(s1.lp, lockSplit);
        addLeg(chain, revenue, pool, p0, p1, METRIC.LOCKED_LP_TO_PROTOCOL);
        addLeg(chain, supply, pool, s0.lp - p0, s1.lp - p1, METRIC.LOCKED_LP_TO_CREATORS);
      } else {
        addLeg(chain, supply, pool, s0.lp, s1.lp, METRIC.LP_REVENUE);
      }
    }
  }

  // ---- 2. what the launch guards take themselves, outside `Swap.fee` ----
  const poolsOf = (manager: string) => poolsByManager.get(manager) ?? {};
  for (const [guard, generation] of guards) {
    const streams: GuardStream[] = [TAX_STREAM];
    // Only the quote-fee generation takes its trade fee itself; the lp-fee
    // generation's fee is inside Swap.fee and was counted above.
    if (generation === "quoteFee") streams.push(FEE_STREAM);

    for (const stream of streams) {
      const logs = (await getLogs({ target: guard, eventAbi: stream.eventAbi })).filter((log: any) => {
        const id = String(log.poolId).toLowerCase();
        const pool = poolsOf(config.clPoolManager)[id] ?? poolsOf(config.binPoolManager)[id];
        // Only a pool created on THIS guard, on this chain's own managers.
        return pool !== undefined && pool.hooks === guard && !excluded(pool);
      });
      if (!logs.length) continue;

      const ids = [...new Set(logs.map((l: any) => String(l.poolId).toLowerCase()))];
      const raw = await options.toApi.multiCall({
        abi: stream.splitAbi,
        calls: ids.map((id) => ({ target: guard, params: [id] })),
        permitFailure: true,
      });
      const splits = new Map(ids.map((id, i) => [id, readSplit(raw[i], stream.splitIndex)]));

      for (const log of logs) {
        const currency = String(log.currency);
        const amount = BigInt(log.amount);
        const split = splits.get(String(log.poolId).toLowerCase());
        addIn(fees, currency, amount, stream.labels.fee);
        if (split) {
          const protocol = protocolPart(amount, split);
          addIn(revenue, currency, protocol, stream.labels.protocol);
          addIn(supply, currency, amount - protocol, stream.labels.creators);
        } else {
          // The split could not be read: never a guess. It is still a fee the
          // swapper paid; no part of it is claimed as protocol revenue.
          addIn(supply, currency, amount, stream.labels.unread);
        }
      }
    }
  }

  // Income statement.
  //
  // dailyFees / dailyUserFees  everything the swapper paid: the pool's own fee
  //                            (Swap.fee, core protocol fee included) plus what a
  //                            launch guard took itself (creator tax; on the
  //                            quote-fee generation also its part of the trade fee).
  // dailyRevenue / ProtocolRev the core protocol fee; the protocol's share of a
  //                            launch pool's LP fees under its locks' split (only
  //                            where the locks provably hold all the liquidity);
  //                            and the protocol's share of guard-taken amounts
  //                            under the pool's frozen split read from the guard.
  // dailySupplySideRevenue     the rest: LPs, and creators/integrators.
  // dailyHoldersRevenue        omitted. Latch has no token.
  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

interface GuardStream {
  eventAbi: string;
  splitAbi: object;
  splitIndex: { creator: number; integrator: number; protocol: number };
  labels: { fee: string; protocol: string; creators: string; unread: string };
}

/** `TaxTaken`, split by `getTax(poolId)`: the pool's frozen tax split. */
const TAX_STREAM: GuardStream = {
  eventAbi: TAX_TAKEN_EVENT,
  splitAbi: GET_TAX_ABI,
  splitIndex: { creator: 4, integrator: 7, protocol: 6 },
  labels: {
    fee: METRIC.CREATOR_TAX,
    protocol: METRIC.CREATOR_TAX_TO_PROTOCOL,
    creators: METRIC.CREATOR_TAX_TO_CREATORS,
    unread: METRIC.CREATOR_TAX_SPLIT_UNREAD,
  },
};

/** `FeeTaken`, split by `getFeeSplit(poolId)`: written once, before the pool exists. */
const FEE_STREAM: GuardStream = {
  eventAbi: FEE_TAKEN_EVENT,
  splitAbi: GET_FEE_SPLIT_ABI,
  splitIndex: { creator: 1, integrator: 3, protocol: 2 },
  labels: {
    fee: METRIC.LAUNCH_FEES,
    protocol: METRIC.LAUNCH_FEES_TO_PROTOCOL,
    creators: METRIC.LAUNCH_FEES_TO_CREATORS,
    unread: METRIC.LAUNCH_FEES_SPLIT_UNREAD,
  },
};

/**
 * The configured launch guards that some pool on this chain was created with,
 * each verified on chain: `getHooksRegistrationBitmap()` must be EXACTLY the
 * bitmap of the generation the config lists it under, for the pool type of the
 * pools that use it. Anything else is a misconfiguration and throws, so a wrong
 * list can never read the wrong events. A listed guard no pool uses is not read.
 */
async function resolveGuards(
  options: FetchOptions,
  config: LatchChainConfig,
  pools: Pool[],
): Promise<Map<string, GuardGeneration>> {
  const listed = new Map<string, GuardGeneration>();
  for (const g of config.launchGuards?.lpFee ?? []) listed.set(g.toLowerCase(), "lpFee");
  for (const g of config.launchGuards?.quoteFee ?? []) {
    if (listed.has(g.toLowerCase())) throw new Error(`Latch: guard ${g} is listed under both generations`);
    listed.set(g.toLowerCase(), "quoteFee");
  }
  const kinds = new Map<string, Set<"CL" | "Bin">>();
  for (const p of pools) {
    if (!listed.has(p.hooks)) continue;
    if (!kinds.has(p.hooks)) kinds.set(p.hooks, new Set());
    kinds.get(p.hooks)!.add(p.kind);
  }
  const out = new Map<string, GuardGeneration>();
  const used = [...kinds.keys()];
  if (!used.length) return out;

  const bitmaps = await options.toApi.multiCall({
    abi: BITMAP_ABI,
    calls: used.map((target) => ({ target })),
    permitFailure: true,
  });
  used.forEach((guard, i) => {
    const raw = bitmaps[i];
    const bitmap = raw === null || raw === undefined ? undefined : Number(raw);
    const generation = listed.get(guard)!;
    for (const kind of kinds.get(guard)!)
      if (bitmap !== LAUNCH_GUARD_BITMAPS[generation][kind])
        throw new Error(
          `Latch: guard ${guard} is listed as ${generation} (${kind}) but getHooksRegistrationBitmap() answered ${
            bitmap === undefined ? "nothing" : "0x" + bitmap.toString(16)
          }`,
        );
    out.set(guard, generation);
  });
  return out;
}

interface Lock {
  tokenId: bigint;
  split: Split | undefined;
}

/** Every CL lock on this chain's lockers, by pool id, with its split (written once, never changed). */
async function readLocks(getLogs: FetchOptions["getLogs"], config: LatchChainConfig): Promise<Map<string, Lock[]>> {
  const out = new Map<string, Lock[]>();
  for (const locker of config.clLPLockers ?? []) {
    const logs = await getLogs({ target: locker, eventAbi: POSITION_LOCKED_EVENT, fromBlock: config.fromBlock, cacheInCloud: true });
    for (const log of logs) {
      const poolId = String(log.poolId).toLowerCase();
      if (!out.has(poolId)) out.set(poolId, []);
      out.get(poolId)!.push({ tokenId: BigInt(log.tokenId), split: readSplit(log, { creator: 4, integrator: 5, protocol: 6 }) });
    }
  }
  return out;
}

/**
 * The split under which a CL pool's LP fees reach the protocol, or undefined.
 *
 * Only when the chain proves it: every liquidity change the pool has had came
 * from the lockers' position manager, on a position (salt = token id) locked for
 * this pool, and every such lock has the same split. The locks then hold all of
 * the pool's liquidity, so every LP fee reaches the protocol by that split when it
 * is collected. One outside position, or two different splits, and the LP part is
 * reported as LP revenue with no protocol share: never a guess.
 */
async function soleLockSplit(
  getLogs: FetchOptions["getLogs"],
  config: LatchChainConfig,
  poolId: string,
  poolLocks: Lock[],
): Promise<Split | undefined> {
  const first = poolLocks[0]?.split;
  if (!first || !poolLocks.every((l) => l.split && sameSplit(l.split, first))) return undefined;
  const locked = new Set(poolLocks.map((l) => l.tokenId));

  const mods = await getLogs({
    target: config.clPoolManager,
    eventAbi: MODIFY_LIQUIDITY_EVENT,
    fromBlock: config.fromBlock,
    // topic1 is the pool id: this pool's liquidity history only.
    topics: [MODIFY_LIQUIDITY_TOPIC0, poolId],
  });
  if (!mods.length) return undefined;
  const positionManager = config.clPositionManager!.toLowerCase();
  for (const m of mods) {
    if (String(m.id).toLowerCase() !== poolId) return undefined;
    if (String(m.sender).toLowerCase() !== positionManager) return undefined;
    if (!locked.has(BigInt(m.salt))) return undefined;
  }
  return first;
}

const adapter: SimpleAdapter = {
  version: 2,
  // Swap logs are window-scoped, so an hourly pull is exact and cheap.
  pullHourly: true,
  fetch,
  adapter: {},
  methodology: {
    Volume:
      "Gross input of every swap on CLPoolManager and BinPoolManager, one leg per swap. Swaps in Latch's own test tokens (LTT1/LTT2 on Robinhood Chain) are excluded: they have no market and no price.",
    Fees: "Everything traders pay on a swap: the pool's swap fee from the Swap event (protocol fee included), plus what a Latch launch pool's guard takes itself - the creator tax, and on newer launch guards the guard's part of the trade fee - read from the guard's TaxTaken and FeeTaken events. Only Latch's own launch guards are read.",
    UserFees: "Same as Fees - traders pay all of it; liquidity providers are not charged.",
    Revenue:
      "What reaches the protocol, counted when the fee is taken: the protocol fee each Swap event carries; the protocol's share of a launch pool's liquidity fees under the pool's permanent LP lock split, only where the locks provably hold all of the pool's liquidity; and the protocol's share of the creator tax and guard trade fee under the split the guard stores for that pool. A split that cannot be read is never guessed: that amount is left out of Revenue.",
    ProtocolRevenue:
      "All of Revenue. Latch has no token, so nothing is diverted to holders.",
    SupplySideRevenue:
      "Fees minus Revenue: swap fees earned by liquidity providers, and the shares of locked-liquidity fees, creator tax and guard trade fees that go to launch creators and integrators (and any guard-taken amount whose split could not be read).",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.SWAP_FEES]: "Swap fee charged by the pool, read from each Swap event.",
      [METRIC.LAUNCH_FEES]: "The part of a launch pool's trade fee that the launch guard takes itself (FeeTaken).",
      [METRIC.CREATOR_TAX]: "Buy/sell tax a launch pool's guard takes after the swap (TaxTaken).",
    },
    UserFees: {
      [METRIC.SWAP_FEES]: "Swap fee charged by the pool, read from each Swap event.",
      [METRIC.LAUNCH_FEES]: "The part of a launch pool's trade fee that the launch guard takes itself (FeeTaken).",
      [METRIC.CREATOR_TAX]: "Buy/sell tax a launch pool's guard takes after the swap (TaxTaken).",
    },
    Revenue: {
      [METRIC.PROTOCOL_REVENUE]: "Protocol fee slice of the swap fee, at the rate each Swap event carried on chain.",
      [METRIC.LOCKED_LP_TO_PROTOCOL]: "Protocol share of a launch pool's liquidity fees under its LP lock split.",
      [METRIC.LAUNCH_FEES_TO_PROTOCOL]: "Protocol share of the guard-taken trade fee under the pool's fee split.",
      [METRIC.CREATOR_TAX_TO_PROTOCOL]: "Protocol share of the creator tax under the pool's tax split.",
    },
    ProtocolRevenue: {
      [METRIC.PROTOCOL_REVENUE]: "Protocol fee slice of the swap fee, at the rate each Swap event carried on chain.",
      [METRIC.LOCKED_LP_TO_PROTOCOL]: "Protocol share of a launch pool's liquidity fees under its LP lock split.",
      [METRIC.LAUNCH_FEES_TO_PROTOCOL]: "Protocol share of the guard-taken trade fee under the pool's fee split.",
      [METRIC.CREATOR_TAX_TO_PROTOCOL]: "Protocol share of the creator tax under the pool's tax split.",
    },
    SupplySideRevenue: {
      [METRIC.LP_REVENUE]: "Swap fee remaining after the protocol slice, earned by liquidity providers.",
      [METRIC.LOCKED_LP_TO_CREATORS]: "Creator and integrator shares of a launch pool's liquidity fees under its LP lock split.",
      [METRIC.LAUNCH_FEES_TO_CREATORS]: "Creator and integrator shares of the guard-taken trade fee.",
      [METRIC.LAUNCH_FEES_SPLIT_UNREAD]: "Guard-taken trade fee whose split could not be read; none of it is counted as Revenue.",
      [METRIC.CREATOR_TAX_TO_CREATORS]: "Creator and integrator shares of the creator tax.",
      [METRIC.CREATOR_TAX_SPLIT_UNREAD]: "Creator tax whose split could not be read; none of it is counted as Revenue.",
    },
  },
};

// Only chains with a real deployment are exported. An unconfigured chain would
// otherwise report a zero, which DefiLlama would cache as fact.
for (const [chain, config] of Object.entries(chainConfig)) {
  if (isConfigured(config)) (adapter.adapter as BaseAdapter)[chain] = { start: config.start };
}

export default adapter;
