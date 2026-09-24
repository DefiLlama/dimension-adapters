import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addProtocolCut, ZERO } from "./helpers";


/**
 * StonkBrokers Safety Deposit Box — liquidity lockers on Robinhood Chain.
 *
 * Fee sources:
 * 1. Locker protocol cuts (Uniswap V3 + V4 and up. DEX v2 + CL lockers) →
 *    SafetyDepositClockInV3 (90% brokers / 10% protocol wallet), plus the
 *    lock owners' 80% share of LP fees claimed through the locked positions.
 * 2. Token vesting locker (StonkVestingLocker): 0.01% (1 bps) deposit fee,
 *    routed to the same SafetyDepositClockInV3.
 *
 * The other StonkBrokers products (Anvil NFTFi, Broker Box, Safe Launch,
 * Nightshades, Smart LP) are listed separately under stonkbrokers-*.
 */

// Safety Deposit Box lockers → fee router. Uniswap V3/V4 pair live 2026-07-25;
// up. DEX (up33) v2 + Slipstream-CL lockers live 2026-08-11 (same protocol-fee
// semantics, protocol cuts route to the same SafetyDepositClockInV3 box).
const LOCKER_V3 = "0xFc96CF67eCC55bE4AdABc3AecBe6Ad6349f11223";
const LOCKER_V4 = "0x5a28ce098750f73bc9eC142D4bCE464E1A0BBdA6";
const LOCKER_UP_V2 = "0x21797736C25851A6102D196afbA78F978f589017";
const LOCKER_UP_CL = "0xc1AfA59e2aBC1C868C51a1F799a7578EaCfEa076";
// Fee sink (not read on-chain here): SafetyDepositClockInV3
// 0x55642A3F10F1Af5145D3d59021B1D6b03BB8692c — splits locker cuts 90/10.
const LOCKER_PROTOCOL_BPS = 1000n; // SafetyDepositClockInV3 PROTOCOL_BPS
const LOCKER_BROKER_BPS = 9000n;

// Token vesting locker — 1 bps deposit fee → SafetyDepositClockInV3.
const VESTING_LOCKER = "0x2b4aD79DA7BD3bF340bBd2aD2039b149214e9Aa9";

const LOCK_FEES_COLLECTED =
  "event LockFeesCollected(uint256 indexed lockTokenId, uint256 userAmount0, uint256 userAmount1, uint256 protocolAmount0, uint256 protocolAmount1)";
// liquidity is uint128 on-chain — wrong width → wrong topic0 and silent misses.
const LOCK_LIQUIDITY_DECREASED =
  "event LockLiquidityDecreased(uint256 indexed lockTokenId, uint128 liquidity, uint256 userAmount0, uint256 userAmount1, uint256 protocolAmount0, uint256 protocolAmount1)";
// up. lockers: gauge-staking payouts move per-token amounts (token0, token1
// and/or the gauge reward token) — the token rides in the event, so no
// lockPositions lookup is needed for these.
const LOCK_TOKENS_PAID =
  "event LockTokensPaid(uint256 indexed lockTokenId, address indexed token, uint256 userAmount, uint256 protocolAmount)";
const POSITION_LOCKED =
  "event PositionLocked(address indexed token, uint256 indexed lockTokenId, address indexed owner, address vault, uint64 startUnlock, uint64 finishUnlock, uint256 initialAmount, uint256 feeAmount)";

const LABELS = {
  LOCKER_FEES: "Safety Deposit Box liquidity-locker protocol fees",
  LOCKER_STOCK_DIVIDENDS: "Locker fees → SafetyDepositClockIn brokers (90%)",
  LOCKER_PROTOCOL: "Locker fees → protocol wallet (10%)",
  LOCKER_LP_FEES: "Locked-LP trading fees claimed by lock owners (80% creator share)",
  VESTING_FEES: "Token vesting locker deposit fees (0.01%)",
};

type LockerKind = "v3" | "v4" | "upv2" | "upcl";

const LOCK_POSITIONS_ABI: Record<LockerKind, string> = {
  // LockPosition: positionTokenId, lockTokenId, token0, token1, ...
  v3: "function lockPositions(uint256) view returns (uint256 positionTokenId, uint256 lockTokenId, address token0, address token1, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed)",
  // V4Lock: currency0, currency1, fee, tickSpacing, hooks, tickLower, tickUpper, ...
  v4: "function lockPositions(uint256) view returns (address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks, int24 tickLower, int24 tickUpper, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed)",
  // V2Lock: pool, vault, token0, token1, ...
  upv2: "function lockPositions(uint256) view returns (address pool, address vault, address token0, address token1, uint256 lockTokenId, uint256 initialAmount, uint256 withdrawnAmount, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed, address gauge)",
  // CLLock: positionTokenId, lockTokenId, token0, token1, tickSpacing, ...
  upcl: "function lockPositions(uint256) view returns (uint256 positionTokenId, uint256 lockTokenId, address token0, address token1, int24 tickSpacing, uint128 initialLiquidity, uint128 withdrawnLiquidity, uint64 startUnlock, uint64 finishUnlock, uint8 feeMode, bool closed, address gauge)",
};

const LOCKER_META: { addr: string; kind: LockerKind }[] = [
  { addr: LOCKER_V3, kind: "v3" },
  { addr: LOCKER_V4, kind: "v4" },
  { addr: LOCKER_UP_V2, kind: "upv2" },
  { addr: LOCKER_UP_CL, kind: "upcl" },
];

/** Resolve token0/token1 (or currency0/currency1) for a lock, caching per id. */
async function resolveLockTokens(
  options: FetchOptions,
  locker: string,
  lockIds: string[],
  kind: LockerKind,
  cache: Map<string, [string, string]>,
) {
  const missing = lockIds.filter((id) => !cache.has(`${locker}:${id}`));
  if (missing.length === 0) return;

  const rows = await options.api.multiCall({
    abi: LOCK_POSITIONS_ABI[kind],
    calls: missing.map((id) => ({ target: locker, params: [id] })),
    permitFailure: true,
  });
  rows.forEach((row: any, i: number) => {
    if (!row) return;
    const t0 = kind === "v4" ? (row.currency0 || row[0]) : (row.token0 || row[2]);
    const t1 = kind === "v4" ? (row.currency1 || row[1]) : (row.token1 || row[3]);
    cache.set(`${locker}:${missing[i]}`, [(t0 || ZERO).toLowerCase(), (t1 || ZERO).toLowerCase()]);
  });
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Robinhood is not in addTokensReceived's log-fallback chain map, so locker
  // cuts are read from the fee events + a lockPositions lookup. Fetched one
  // locker at a time: getLogs defaults to onlyArgs, so multi-target results
  // carry no log.address to attribute the emitting locker with.
  const lockerLogBatches = await Promise.all(
    LOCKER_META.flatMap(({ addr, kind }) => {
      const batches = [
        options.getLogs({ target: addr, eventAbi: LOCK_FEES_COLLECTED }).then((logs) => ({ addr, kind, logs })),
      ];
      // LockLiquidityDecreased exists on the position-NFT lockers (V3, V4,
      // up. CL); the up. v2 locker withdraws LP tokens instead (not evented
      // per pair token, so its withdraw cut is not visible here).
      if (kind !== "upv2") {
        batches.push(
          options.getLogs({ target: addr, eventAbi: LOCK_LIQUIDITY_DECREASED }).then((logs) => ({ addr, kind, logs })),
        );
      }
      return batches;
    }),
  );
  // Gauge-staking payout cuts on the up. lockers carry the token in the event.
  const lockerTokensPaidLogs = await Promise.all(
    [LOCKER_UP_V2, LOCKER_UP_CL].map((addr) => options.getLogs({ target: addr, eventAbi: LOCK_TOKENS_PAID })),
  );
  const vestingLockedLogs = await options.getLogs({ target: VESTING_LOCKER, eventAbi: POSITION_LOCKED });

  // ── Liquidity locker protocol cuts ───────────────────────────────────────
  // Attribute 90/10 to match SafetyDepositClockInV3's hardwired split.
  // Upfront-mode cuts that never emit LockFeesCollected are not visible here
  // (Robinhood has no Transfer-log fallback in addTokensReceived); collect /
  // withdraw cuts dominate live volume and are fully covered.
  const lockCache = new Map<string, [string, string]>();
  // Group by locker so lockPositions multicalls stay batched.
  const byLocker = new Map<string, { kind: LockerKind; logs: any[] }>();
  for (const { addr, kind, logs } of lockerLogBatches) {
    const key = addr.toLowerCase();
    let bucket = byLocker.get(key);
    if (!bucket) {
      bucket = { kind, logs: [] };
      byLocker.set(key, bucket);
    }
    bucket.logs.push(...logs);
  }
  for (const [locker, batch] of byLocker) {
    const ids = [...new Set(batch.logs.map((l) => String(l.lockTokenId)))];
    await resolveLockTokens(options, locker, ids, batch.kind, lockCache);
    for (const log of batch.logs) {
      const pair = lockCache.get(`${locker}:${String(log.lockTokenId)}`);
      if (!pair) continue;
      const amounts: [string, bigint][] = [
        [pair[0], BigInt(log.protocolAmount0)],
        [pair[1], BigInt(log.protocolAmount1)],
      ];
      for (const [token, amount] of amounts) {
        if (amount <= 0n) continue;
        const brokerAmt = (amount * LOCKER_BROKER_BPS) / 10_000n;
        const protocolAmt = (amount * LOCKER_PROTOCOL_BPS) / 10_000n;
        addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_FEES);
        addProtocolCut(dailySupplySideRevenue, token, brokerAmt, LABELS.LOCKER_STOCK_DIVIDENDS);
        addProtocolCut(dailyProtocolRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
        addProtocolCut(dailyRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
      }
      // LockFeesCollected also carries the lock owner's 80% LP-fee share
      // (userAmount0/1) — genuine trading-fee income earned through the
      // protocol's locked positions, booked as supply-side. Withdrawal logs
      // (LockLiquidityDecreased, distinguished by the liquidity field) pay
      // PRINCIPAL in userAmount0/1 and must never be counted as fees.
      const isWithdraw = log.liquidity !== undefined && log.liquidity !== null;
      if (!isWithdraw) {
        const userAmounts: [string, bigint][] = [
          [pair[0], BigInt(log.userAmount0)],
          [pair[1], BigInt(log.userAmount1)],
        ];
        for (const [token, amount] of userAmounts) {
          if (amount <= 0n) continue;
          addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_LP_FEES);
          addProtocolCut(dailySupplySideRevenue, token, amount, LABELS.LOCKER_LP_FEES);
        }
      }
    }
  }
  // Gauge-staking payout cuts (token address rides in the event).
  for (const logs of lockerTokensPaidLogs) {
    for (const log of logs) {
      const token = String(log.token || ZERO).toLowerCase();
      const amount = BigInt(log.protocolAmount);
      if (amount > 0n) {
        const brokerAmt = (amount * LOCKER_BROKER_BPS) / 10_000n;
        const protocolAmt = (amount * LOCKER_PROTOCOL_BPS) / 10_000n;
        addProtocolCut(dailyFees, token, amount, LABELS.LOCKER_FEES);
        addProtocolCut(dailySupplySideRevenue, token, brokerAmt, LABELS.LOCKER_STOCK_DIVIDENDS);
        addProtocolCut(dailyProtocolRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
        addProtocolCut(dailyRevenue, token, protocolAmt, LABELS.LOCKER_PROTOCOL);
      }
      // Gauge-staking rewards paid to the lock owner (80% share) — earned
      // through the locked positions, booked gross as supply-side fees.
      const userAmt = BigInt(log.userAmount);
      if (userAmt > 0n) {
        addProtocolCut(dailyFees, token, userAmt, LABELS.LOCKER_LP_FEES);
        addProtocolCut(dailySupplySideRevenue, token, userAmt, LABELS.LOCKER_LP_FEES);
      }
    }
  }

  // ── Token vesting locker deposit fees (1 bps) ───────────────────────────
  for (const log of vestingLockedLogs) {
    const fee = BigInt(log.feeAmount);
    if (fee <= 0n) continue;
    const token = String(log.token || ZERO).toLowerCase();
    addProtocolCut(dailyFees, token, fee, LABELS.VESTING_FEES);
    addProtocolCut(dailyRevenue, token, fee, LABELS.VESTING_FEES);
    addProtocolCut(dailyProtocolRevenue, token, fee, LABELS.VESTING_FEES);
  }

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-07-17",
  doublecounted: true,
  methodology: {
    Fees:
      "Safety Deposit Box liquidity-locker protocol cuts (Uniswap V3/V4 + up. DEX v2/CL lockers) from LockFeesCollected / LockLiquidityDecreased / LockTokensPaid; LP trading fees claimed through the locked positions (the lock owner's 80% share of LockFeesCollected plus gauge rewards from LockTokensPaid); and StonkVestingLocker 0.01% deposit fees.",
    Revenue:
      "10% of locker protocol cuts and vesting-locker deposit fees.",
    ProtocolRevenue:
      "10% of locker protocol cuts → protocol wallet; vesting-locker deposit fees → SafetyDepositClockInV3.",
    SupplySideRevenue:
      "90% of locker protocol cuts → SafetyDepositClockIn broker claims, and the lock owners' 80% share of locked-LP trading fees + gauge rewards claimed through the lockers.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.LOCKER_FEES]:
        "Protocol cut on Safety Deposit Box locks (Uniswap V3/V4 + up. DEX v2/CL lockers) from LockFeesCollected / LockLiquidityDecreased / LockTokensPaid (20% of LP fee collects / 1% withdraw; upfront 0.5% not evented).",
      [LABELS.LOCKER_LP_FEES]:
        "LP trading fees earned by positions locked in the Safety Deposit Box and claimed by lock owners — the 80% userAmount share of LockFeesCollected plus gauge-staking rewards (LockTokensPaid userAmount). Withdrawal principal (LockLiquidityDecreased) is excluded.",
      [LABELS.VESTING_FEES]:
        "0.01% (1 bps) StonkVestingLocker deposit fee (PositionLocked.feeAmount), routed to SafetyDepositClockInV3.",
    },
    Revenue: {
      [LABELS.LOCKER_PROTOCOL]: "10% of locker protocol fees → protocol wallet.",
      [LABELS.VESTING_FEES]: "StonkVestingLocker deposit fees → SafetyDepositClockInV3.",
    },
    ProtocolRevenue: {
      [LABELS.LOCKER_PROTOCOL]: "10% of locker protocol fees → protocol wallet.",
      [LABELS.VESTING_FEES]: "StonkVestingLocker deposit fees → SafetyDepositClockInV3.",
    },
    SupplySideRevenue: {
      [LABELS.LOCKER_STOCK_DIVIDENDS]:
        "90% of locker protocol fees → SafetyDepositClockIn broker claim rounds / StockBooster ETH flush.",
      [LABELS.LOCKER_LP_FEES]:
        "Lock owners' 80% share of LP trading fees + gauge rewards claimed through Safety Deposit Box locked positions.",
    },
  },
};

export default adapter;
