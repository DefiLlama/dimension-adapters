import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { isCoreAsset } from "../helpers/prices";

// Ilyris: discrete-bin AMM (Meteora DLMM / Liquidity Book style) on Robinhood Chain (chainId 4663).
// Each pool is a standalone BinPool; traders (and aggregators such as KyberSwap) call the pool directly.
// Source: https://github.com/combatwombat1915/ilyris (src/BinPool.sol, src/BinFactory.sol)
// BinFactory, the only source of Ilyris pools: https://explorer.mainnet.chain.robinhood.com/address/0x3Bf76F2E41Ac7996c822455f4c78fa2026465C4D
const FACTORY = "0x3Bf76F2E41Ac7996c822455f4c78fa2026465C4D";

// BinPool.Swap. amountIn is the GROSS input (fee included) and feeAmount is the total fee,
// both denominated in the input token (tokenX when xForY, else tokenY). See BinPool._accrueFee:
// "fees are always taken in the input token".
const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, bool xForY, uint256 amountIn, uint256 amountOut, uint256 feeAmount, int24 activeIdAfter, uint24 volatilityAccumulatorAfter)";

// Pools are discovered from the factory's own PoolCreated events (no historical eth_call needed;
// the public Robinhood RPCs are not archival, so per-window contract reads fail on old dates).
// First pool created at block 50571654 (2026-08-31T04:16:38Z).
const FACTORY_FROM_BLOCK = 50571654;
const POOL_CREATED_EVENT =
  "event PoolCreated(address indexed tokenX, address indexed tokenY, uint24 indexed binStepBps, uint24 swapFeeBps, address policy, address marketGuard, address pool)";

// protocolShareBps (out of 10_000) is the share of every swap fee skimmed to the pool's feeRecipient
// before the remainder accrues to LPs (BinPool._accrueFee). The deployed constructor sets it to
// DEFAULT_PROTOCOL_SHARE_BPS = 1_000 (10%) without emitting an event (source commit dc88789, and
// feeConfig().protocolShareBps reads 1000 on all four pools with no FeeConfigSet ever emitted).
// The owner can change it with setFeeConfig, which emits FeeConfigSet (capped at
// MAX_PROTOCOL_SHARE_BPS = 5_000). Changes are replayed in (blockNumber, logIndex) order so every
// swap uses the share that was live when it executed.
const FEE_CONFIG_SET_EVENT =
  "event FeeConfigSet(uint24 baseFactor, uint16 filterPeriod, uint16 decayPeriod, uint16 reductionFactor, uint24 variableFeeControl, uint24 maxVolatilityAccumulator, uint16 protocolShareBps)";
const DEFAULT_PROTOCOL_SHARE_BPS = 1_000n;
const BPS = 10_000n;

type Positioned = { blockNumber: number; logIndex: number };
const isBefore = (a: Positioned, b: Positioned) =>
  a.blockNumber < b.blockNumber || (a.blockNumber === b.blockNumber && a.logIndex < b.logIndex);
const position = (log: any): Positioned => ({ blockNumber: Number(log.blockNumber), logIndex: Number(log.logIndex) });

const METRIC = {
  SWAP_FEES: "Swap Fees",
  SWAP_FEES_TO_PROTOCOL: "Swap Fees To Protocol",
  SWAP_FEES_TO_LPS: "Swap Fees To LPs",
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, getLogs } = options;
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const poolCreated = await getLogs({
    target: FACTORY,
    eventAbi: POOL_CREATED_EVENT,
    fromBlock: FACTORY_FROM_BLOCK,
    cacheInCloud: true,
  });
  const poolInfo: Record<string, { tokenX: string; tokenY: string }> = {};
  poolCreated.forEach((log: any) => {
    poolInfo[log.pool.toLowerCase()] = { tokenX: log.tokenX, tokenY: log.tokenY };
  });
  const pools = Object.keys(poolInfo);
  if (!pools.length) throw new Error("ilyris: no PoolCreated logs found for the factory");

  const toBlock = await options.getToBlock();
  const feeConfigLogs = await getLogs({
    targets: pools,
    eventAbi: FEE_CONFIG_SET_EVENT,
    fromBlock: FACTORY_FROM_BLOCK,
    toBlock,
    onlyArgs: false,
    cacheInCloud: true,
  });
  const shareChanges: Record<string, (Positioned & { bps: bigint })[]> = {};
  feeConfigLogs.forEach((log: any) => {
    const pool = log.address.toLowerCase();
    if (!shareChanges[pool]) shareChanges[pool] = [];
    shareChanges[pool].push({ ...position(log), bps: BigInt(log.args.protocolShareBps) });
  });
  Object.values(shareChanges).forEach((changes) => changes.sort((a, b) => (isBefore(a, b) ? -1 : 1)));
  const protocolShareAt = (pool: string, at: Positioned) => {
    let bps = DEFAULT_PROTOCOL_SHARE_BPS;
    for (const change of shareChanges[pool] ?? []) {
      if (!isBefore(change, at)) break;
      bps = change.bps;
    }
    return bps;
  };

  const swapLogs = await getLogs({ targets: pools, eventAbi: SWAP_EVENT, onlyArgs: false });

  swapLogs.forEach((log: any) => {
    const pool = log.address.toLowerCase();
    const { tokenX, tokenY } = poolInfo[pool];
    const { xForY, amountIn, amountOut, feeAmount } = log.args;
    const tokenIn = xForY ? tokenX : tokenY;
    const tokenOut = xForY ? tokenY : tokenX;
    const fee = BigInt(feeAmount);
    const protocolFee = (fee * protocolShareAt(pool, position(log))) / BPS;

    // Volume is gross of fees, so count the input leg. Fall back to the output leg only
    // when the input token is not a whitelisted pricing asset (e.g. YRIS sold for WETH).
    if (isCoreAsset(chain, tokenIn) || !isCoreAsset(chain, tokenOut)) dailyVolume.add(tokenIn, amountIn);
    else dailyVolume.add(tokenOut, amountOut);

    dailyFees.add(tokenIn, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(tokenIn, protocolFee, METRIC.SWAP_FEES_TO_PROTOCOL);
    dailySupplySideRevenue.add(tokenIn, fee - protocolFee, METRIC.SWAP_FEES_TO_LPS);
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Value of tokens traders sold into Ilyris pools, fees included.",
  Fees: "Swap fees paid by traders on every Ilyris swap, a base fee per pool plus a variable fee that rises while the market is volatile.",
  UserFees: "Swap fees paid by traders on every Ilyris swap.",
  Revenue: "The protocol's share of swap fees (10% on every pool since launch), sent to the pool's fee recipient wallet.",
  ProtocolRevenue: "The protocol's share of swap fees (10% on every pool since launch), sent to the pool's fee recipient.",
  SupplySideRevenue: "The remaining 90% of swap fees, which stay in the bins and accrue to liquidity providers.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders, charged in the token they sell.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders, charged in the token they sell.",
  },
  Revenue: {
    [METRIC.SWAP_FEES_TO_PROTOCOL]: "Each pool's protocolShareBps of every swap fee, skimmed to the pool's fee recipient.",
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES_TO_PROTOCOL]: "Each pool's protocolShareBps of every swap fee, skimmed to the pool's fee recipient.",
  },
  SupplySideRevenue: {
    [METRIC.SWAP_FEES_TO_LPS]: "The rest of every swap fee, credited to the liquidity providers of the bins the swap crossed.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  // first Swap: block 51718832, 2026-09-01T12:26:50Z (pools created 2026-08-31)
  start: "2026-09-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
