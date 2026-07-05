// Rooster Protocol V2 - Algebra Integral concentrated-liquidity DEX on Plume.
// Volume, fees and revenue are computed fully on-chain from pool events:
//  - Every swap emits `Swap(...amount0, amount1...)` (token deltas -> volume) and,
//    in the same tx immediately before it, `SwapFee(sender, overrideFee, pluginFee)`
//    where `overrideFee` is the exact dynamic fee applied to that swap (units 1e-6).
//  - The Algebra fee is charged on the input amount, so for every swap
//    feeAmount(inputToken) = inputDelta * feeRate / 1e6  (exact for exact-in and exact-out).
//  - The protocol's cut is the pool `communityFee` (units 1e-3), read on-chain from
//    `globalState()`; the remainder accrues to LPs.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const FACTORY = "0x1eB9822d5176C88B1d4eec353fa956C896D77Df9";
const FACTORY_FROM_BLOCK = 23181592; // block of the first pool creation on Plume
const FEE_DENOMINATOR = 1e6; // Algebra Constants.FEE_DENOMINATOR (fee in hundredths of a bip)
const COMMUNITY_FEE_DENOMINATOR = 1e3; // Algebra Constants.COMMUNITY_FEE_DENOMINATOR (communityFee in thousandths)

const POOL_CREATED = "event Pool(address indexed token0, address indexed token1, address pool)";
const CUSTOM_POOL_CREATED = "event CustomPool(address indexed deployer, address indexed token0, address indexed token1, address pool)";
const SWAP = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)";
const SWAP_FEE = "event SwapFee(address indexed sender, uint24 overrideFee, uint24 pluginFee)";
const GLOBAL_STATE = "function globalState() view returns (uint160 price, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances(); // protocol revenue (community fee)
  const dailySupplySideRevenue = options.createBalances(); // LP share

  // 1. Discover all pools (standard + custom) from the factory
  const [poolLogs, customPoolLogs] = await Promise.all([
    options.getLogs({ target: FACTORY, fromBlock: FACTORY_FROM_BLOCK, eventAbi: POOL_CREATED, cacheInCloud: true }),
    options.getLogs({ target: FACTORY, fromBlock: FACTORY_FROM_BLOCK, eventAbi: CUSTOM_POOL_CREATED, cacheInCloud: true }),
  ]);
  const pools: string[] = [...new Set([...poolLogs, ...customPoolLogs].map((log: any) => log.pool))];

  // 2. Per-pool token0/token1 and community fee (protocol cut) + static-fee fallback
  const [token0s, token1s, globalStates] = await Promise.all([
    options.api.multiCall({ abi: "address:token0", calls: pools, permitFailure: true }),
    options.api.multiCall({ abi: "address:token1", calls: pools, permitFailure: true }),
    options.api.multiCall({ abi: GLOBAL_STATE, calls: pools, permitFailure: true }),
  ]);

  // 3. Per-pool Swap logs (volume) and SwapFee logs (per-swap fee rate), index-aligned 1:1
  const [swapLogs, swapFeeLogs] = await Promise.all([
    options.getLogs({ targets: pools, eventAbi: SWAP, flatten: false }),
    options.getLogs({ targets: pools, eventAbi: SWAP_FEE, flatten: false }),
  ]);

  swapLogs.forEach((poolSwaps: any[], i: number) => {
    if (!poolSwaps.length) return;
    const token0 = token0s[i];
    const token1 = token1s[i];
    if (!token0 || !token1) return;
    const gs = globalStates[i];
    const communityFee = gs ? Number(gs.communityFee) : 0; // 0..1000
    const staticFee = gs ? Number(gs.lastFee) : 0; // fallback for non-dynamic-fee pools
    const poolSwapFees = swapFeeLogs[i] || [];

    poolSwaps.forEach((swap: any, j: number) => {
      const amount0 = BigInt(swap.amount0);
      const amount1 = BigInt(swap.amount1);
      // input side = the positive delta (tokens paid into the pool, fee included)
      const zeroForOne = amount0 > 0n;
      const inputToken = zeroForOne ? token0 : token1;
      const inputAmount = zeroForOne ? amount0 : amount1; // positive

      // fee rate: exact per-swap overrideFee when present, else the pool's static fee
      const overrideFee = poolSwapFees[j] ? Number(poolSwapFees[j].overrideFee) : 0;
      const feeRate = overrideFee > 0 ? overrideFee : staticFee;

      const feeAmount = (inputAmount * BigInt(Math.round(feeRate))) / BigInt(FEE_DENOMINATOR);
      const protocolAmount = (feeAmount * BigInt(communityFee)) / BigInt(COMMUNITY_FEE_DENOMINATOR);
      const supplyAmount = feeAmount - protocolAmount;

      dailyVolume.add(inputToken, inputAmount);
      dailyFees.add(inputToken, feeAmount);
      dailyRevenue.add(inputToken, protocolAmount);
      dailySupplySideRevenue.add(inputToken, supplyAmount);
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees, // all fees are paid by swappers
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Sum of the input amount of every swap across all Rooster V2 (Algebra Integral) pools on Plume, read from on-chain Swap events.",
  Fees: "Total swap fees paid by traders, computed per swap as inputAmount * dynamicFee, using the exact per-swap fee from the pool's SwapFee event.",
  UserFees: "Total swap fees paid by traders (same as Fees).",
  Revenue: "Protocol's share of swap fees, i.e. each pool's communityFee applied to that pool's fees, read on-chain from globalState().",
  ProtocolRevenue: "Protocol's share of swap fees (the communityFee that accrues to the protocol community vault).",
  SupplySideRevenue: "Share of swap fees retained by liquidity providers (total fees minus the communityFee).",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.PLUME],
  start: "2025-08-23",
  methodology,
};

export default adapter;
