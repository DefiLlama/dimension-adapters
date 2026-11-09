import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { isCoreAsset } from "../../helpers/prices";

// Ranges is a full fork of the Balancer V3 stack running its own, non-canonical
// Vault, so neither Balancer's subgraph nor api-v3.balancer.fi index these pools
// and helpers/balancer.ts is V2-vault shaped (bytes32 poolId). Read the Vault's
// own Swap logs instead - they carry everything both dashboards need.
//
// The Range stack is deployed deterministically, so every chain after ethereum shares the
// SAME Vault address - the address does not identify the chain. Abstract (chainId 2741) in
// particular carries this very address and is deliberately NOT listed here. Only the keys of
// this map decide which chains the adapter runs on.
const VAULTS: Record<string, string> = {
  [CHAIN.ETHEREUM]: "0x955244EDC797A1C1b04134b600f819aC23C76081",
  [CHAIN.ROBINHOOD]: "0x50A20332547453558E58afa9Ef4cF73033Ce3BE3",
};

const SWAP_EVENT =
  "event Swap(address indexed pool, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 swapFeePercentage, uint256 swapFeeAmount)";

// IVaultExtension.getPoolConfig(address) -> PoolConfig. Decoded positionally,
// so these are the struct's field indexes (VaultTypes.sol: LiquidityManagement,
// staticSwapFeePercentage, aggregateSwapFeePercentage, aggregateYieldFeePercentage,
// tokenDecimalDiffs, pauseWindowEndTime, isPoolRegistered, isPoolInitialized,
// isPoolPaused, isPoolInRecoveryMode).
const POOL_CONFIG_ABI =
  "function getPoolConfig(address pool) view returns (tuple(tuple(bool disableUnbalancedLiquidity, bool enableAddLiquidityCustom, bool enableRemoveLiquidityCustom, bool enableDonation) liquidityManagement, uint256 staticSwapFeePercentage, uint256 aggregateSwapFeePercentage, uint256 aggregateYieldFeePercentage, uint40 tokenDecimalDiffs, uint32 pauseWindowEndTime, bool isPoolRegistered, bool isPoolInitialized, bool isPoolPaused, bool isPoolInRecoveryMode))";
const AGGREGATE_SWAP_FEE_PERCENTAGE = 2;
const IS_POOL_IN_RECOVERY_MODE = 9;

// IProtocolFeeController.getPoolProtocolSwapFeeInfo(address) -> (protocol swap %, isOverride).
const PROTOCOL_SWAP_FEE_INFO_ABI =
  "function getPoolProtocolSwapFeeInfo(address pool) view returns (uint256 protocolSwapFeePercentage, bool isOverride)";

const WAD = 10n ** 18n;
const mulUp = (a: bigint, b: bigint) => (a * b + WAD - 1n) / WAD;
const divUp = (a: bigint, b: bigint) => (a * WAD + b - 1n) / b;

// The Vault takes one aggregate cut (protocol + pool creator); the ProtocolFeeController
// splits it later, in _receiveAggregateFees:
//   creator % == 0 -> all of it to the protocol;  protocol % == 0 -> all of it to the creator;
//   otherwise protocol = mulUp(divUp(aggregate, aggregate %), protocol %), creator = the rest.
// The controller splits the accumulated amount at collection, this splits per swap, so the
// split branch can differ by one raw unit per swap; the other two branches are exact.
// `protocolPct` null = the rate could not be read: book nothing as protocol revenue and leave
// the whole aggregate to the only other party it can go to, the pool creator.
const protocolShare = (aggregate: bigint, aggregatePct: bigint, protocolPct: bigint | null) => {
  if (aggregate === 0n || aggregatePct === 0n || !protocolPct) return 0n;
  // Only reachable with creator % == 0: the aggregate % is exactly the protocol %.
  if (protocolPct >= aggregatePct) return aggregate;
  const protocol = mulUp(divUp(aggregate, aggregatePct), protocolPct);
  return protocol > aggregate ? aggregate : protocol;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const result = {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
    dailyHoldersRevenue,
  };

  const vault = VAULTS[options.chain];
  const logs = await options.getLogs({ target: vault, eventAbi: SWAP_EVENT });
  if (!logs.length) return result;

  const pools = [...new Set(logs.map((log: any) => log.pool.toLowerCase()))];

  // `options.api` is pinned to this slice's end block, so the split uses the
  // rate that was live on the day, not today's. Both the protocol and the pool
  // creator cut are governance-mutable and set per pool - never hardcoded.
  const configs = await options.api.multiCall({ target: vault, abi: POOL_CONFIG_ABI, calls: pools });
  const aggregateFeeByPool: Record<string, bigint> = {};
  configs.forEach((config: any, i: number) => {
    // In recovery mode the Vault skips the aggregate fee entirely (Vault.sol,
    // `_computeAndChargeAggregateSwapFees`) - the whole swap fee stays with LPs.
    aggregateFeeByPool[pools[i]] = config[IS_POOL_IN_RECOVERY_MODE]
      ? 0n
      : BigInt(config[AGGREGATE_SWAP_FEE_PERCENTAGE]);
  });

  // The protocol's own part of that aggregate, from the controller the Vault points to on
  // this block (it is a Vault setting and differs per chain).
  const feeController = await options.api.call({ target: vault, abi: "address:getProtocolFeeController" });
  const protocolInfos = await options.api.multiCall({
    target: feeController,
    abi: PROTOCOL_SWAP_FEE_INFO_ABI,
    calls: pools,
    permitFailure: true,
  });
  const protocolFeeByPool: Record<string, bigint | null> = {};
  protocolInfos.forEach((info: any, i: number) => {
    protocolFeeByPool[pools[i]] = info ? BigInt(info[0]) : null;
  });

  // Which leg carries the volume: the core asset when the trade has one, otherwise
  // tokenIn - the gross amount sold into the pool, which is also what the protocol's
  // own stats price. This is deliberately *not* `addOneToken`, which takes token0 when
  // token0 is core and token1 otherwise without ever looking at token1: on a
  // `ROME -> USDT` trade that lands on the unpriced leg and silently books $0, while
  // checking both legs books the USDT side. ROME and PZL have no price source at all
  // and the two nested pools hold other range pools' BPTs, so the unpriced leg is a
  // real token here, not a hypothetical.
  //
  // A middle rank ("priced but not core", via helpers/uniswap::getEstablishedTokens)
  // was measured on 908 swaps / 30 days and moved neither coverage (908/908 either way)
  // nor volume (0.0000 %): every pool that holds an unpriced token pairs it with core
  // assets only. It cost a live coins.llama.fi call in every hourly slot and made a
  // backfilled day depend on today's prices, so it is not worth carrying. Since then a
  // robinhood pool does pair unpriced tokens (VLAD, ROBINCAT) with priced non-core ones
  // (MARIAN, PIPEDOG); those trades still book $0 volume and fee here - 34 swaps, ~$111 of
  // volume in the 30 days to 2026-09-23 - which is still judged cheaper than live HTTP
  // in every hourly slot.
  const isCore = (token: string) => isCoreAsset(options.chain, token);

  for (const log of logs) {
    const pool = log.pool.toLowerCase();
    const tokenIn = log.tokenIn.toLowerCase();
    const tokenOut = log.tokenOut.toLowerCase();
    const amountIn = BigInt(log.amountIn);
    const amountOut = BigInt(log.amountOut);

    // The Vault reverts a zero trade amount (AmountGivenZero / _MINIMUM_TRADE_AMOUNT), so
    // this cannot come from the chain; guarded only so the fee rescaling below can never
    // divide by zero.
    if (amountIn === 0n) continue;

    // One leg per swap, chosen once: volume and fees are both booked on it.
    const onOut = isCore(tokenOut) && !isCore(tokenIn);
    const leg = onOut ? tokenOut : tokenIn;
    dailyVolume.add(leg, onOut ? amountOut : amountIn);

    // The Vault charges the swap fee on the *input* token in both swap kinds:
    // `_computeAndChargeAggregateSwapFees` is always passed `tokenIn`/`indexIn`,
    // so `swapFeeAmount` is raw tokenIn (Vault.sol). EXACT_IN takes it off
    // amountGiven, EXACT_OUT adds fee/(1-fee) onto the calculated amountIn.
    const feeIn = BigInt(log.swapFeeAmount);
    if (feeIn === 0n) continue;

    // When the volume went to tokenOut, the same fee is expressed in tokenOut at this
    // trade's own rate. feeIn/amountIn is a pure ratio (both raw tokenIn), so the product
    // with amountOut is already raw tokenOut - no decimals to adjust. Multiply first so the
    // integer division loses at most one raw unit. On the tokenIn leg the fee stays exact.
    const fee = onOut ? (amountOut * feeIn) / amountIn : feeIn;
    dailyFees.add(leg, fee, METRIC.SWAP_FEES);
    dailyUserFees.add(leg, fee, METRIC.SWAP_FEES);

    const aggregateFee = (fee * aggregateFeeByPool[pool]) / WAD;
    const protocolFee = protocolShare(aggregateFee, aggregateFeeByPool[pool], protocolFeeByPool[pool]);
    const creatorFee = aggregateFee - protocolFee;
    dailyRevenue.add(leg, protocolFee, METRIC.PROTOCOL_FEES);
    dailyProtocolRevenue.add(leg, protocolFee, METRIC.PROTOCOL_FEES);
    dailySupplySideRevenue.add(leg, fee - aggregateFee, METRIC.LP_FEES);
    if (creatorFee > 0n) dailySupplySideRevenue.add(leg, creatorFee, METRIC.CREATOR_FEES);
  }

  return result;
};

const methodology = {
  Volume: "Value swapped through the Ranges Vault, counted once per trade from the core asset leg when the trade has one, otherwise from the token sold into the pool.",
  Fees: "Swap fees paid by traders, taken from each Swap event's swapFeeAmount. The Vault charges the fee on the input token; it is booked on the same leg as the volume. When that leg is the output token (a non-core token sold for a core asset), the fee is converted at the trade's own rate, amountOut * swapFeeAmount / amountIn - no external price is used. The amount is exact; only its denomination changes. Because amountIn includes the fee itself and the trade's average rate is slightly worse than the pool's marginal rate, the converted fee reads low by about the pool's fee rate plus the trade's own price impact - a share of the fee, never of volume, and always in the under-counting direction.",
  UserFees: "Swap fees paid by traders on every swap.",
  Revenue: "The protocol's share of the swap fee, read per pool from the protocol fee controller.",
  ProtocolRevenue: "Same as Revenue - the protocol's share of the swap fee goes to the protocol fee controller.",
  SupplySideRevenue: "The rest of the swap fee: the part that stays in the pool for liquidity providers, plus the pool creator's share when a pool creator has set one.",
  HoldersRevenue: "Zero - no part of the fee is distributed to token holders today.",
};

const breakdownMethodology = {
  Volume: "Value swapped through the Ranges Vault, counted once per trade.",
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees charged by the Vault on every trade (swapFeeAmount). The Vault denominates the fee in the input token; it is booked on the same leg as the volume, converted at the trade's own rate when that leg is the output token.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on every trade.",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol's share of the swap fee, per pool.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: "Protocol's share of the swap fee, per pool.",
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: "Share of the swap fee left in the pool for liquidity providers.",
    [METRIC.CREATOR_FEES]: "Pool creator's share of the swap fee, set per pool by its creator.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    // Range pool factory + Vault went live on ethereum at block 24557531,
    // and on Robinhood Chain at block 57667858.
    [CHAIN.ETHEREUM]: { fetch, start: "2026-02-28" },
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-09-08" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
