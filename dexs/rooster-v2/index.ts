// Rooster Protocol V2 - Algebra Integral concentrated-liquidity DEX on Plume.
// Volume, fees and revenue are computed fully on-chain from pool events:
//  - Every swap emits `Swap(...amount0, amount1...)` (token deltas -> volume) and,
//    in the same tx immediately before it, `SwapFee(sender, overrideFee, pluginFee)`.
//    `overrideFee` is the exact dynamic swap fee (units 1e-6); `pluginFee` is an
//    extra fee routed to the pool plugin (units 1e-6). Both are charged on the input,
//    so for every swap feeAmount(inputToken) = inputDelta * feeRate / 1e6.
//  - The protocol's cut of the swap fee is the pool `communityFee` (units 1e-3), read
//    on-chain from `globalState()`; the remainder accrues to LPs. The plugin fee is
//    protocol-side revenue in full.
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Rooster V2 AlgebraFactory on Plume mainnet (chainId 98866). Source: app.rooster.trade
// on-chain config; verifiable on the Plume explorer at
// https://explorer.plume.org/address/0x1eB9822d5176C88B1d4eec353fa956C896D77Df9
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
  const dailyRevenue = options.createBalances(); // protocol revenue (community fee + plugin fee)
  const dailySupplySideRevenue = options.createBalances(); // LP share

  // 1. Discover all pools (standard + custom) from the factory
  const [poolLogs, customPoolLogs] = await Promise.all([
    options.getLogs({ target: FACTORY, fromBlock: FACTORY_FROM_BLOCK, eventAbi: POOL_CREATED, cacheInCloud: true }),
    options.getLogs({ target: FACTORY, fromBlock: FACTORY_FROM_BLOCK, eventAbi: CUSTOM_POOL_CREATED, cacheInCloud: true }),
  ]);
  const pools: string[] = [...new Set([...poolLogs, ...customPoolLogs].map((log: any) => log.pool))];

  // 2. Per-pool Swap logs (volume) and SwapFee logs (per-swap fee rate), index-aligned 1:1 with `pools`
  const [swapLogs, swapFeeLogs] = await Promise.all([
    options.getLogs({ targets: pools, eventAbi: SWAP, flatten: false }),
    options.getLogs({ targets: pools, eventAbi: SWAP_FEE, flatten: false }),
  ]);

  // 3. Only fetch token pair + fees for pools that traded in this window
  const activeIndexes = swapLogs.map((logs: any[], i: number) => (logs.length ? i : -1)).filter((i: number) => i >= 0);
  const activePools = activeIndexes.map((i: number) => pools[i]);
  const [token0s, token1s, globalStates] = await Promise.all([
    options.api.multiCall({ abi: "address:token0", calls: activePools, permitFailure: true }),
    options.api.multiCall({ abi: "address:token1", calls: activePools, permitFailure: true }),
    options.api.multiCall({ abi: GLOBAL_STATE, calls: activePools, permitFailure: true }),
  ]);

  activeIndexes.forEach((poolIndex: number, k: number) => {
    const token0 = token0s[k];
    const token1 = token1s[k];
    if (!token0 || !token1) return;
    const gs = globalStates[k];
    const communityFee = gs ? Number(gs.communityFee) : 0; // 0..1000
    const staticFee = gs ? Number(gs.lastFee) : 0; // fallback for pools without a dynamic fee
    const poolSwaps = swapLogs[poolIndex];
    const poolSwapFees = swapFeeLogs[poolIndex] || [];

    poolSwaps.forEach((swap: any, j: number) => {
      const amount0 = BigInt(swap.amount0);
      const amount1 = BigInt(swap.amount1);
      // input side = the positive delta (tokens paid into the pool, fee included)
      const zeroForOne = amount0 > 0n;
      const inputToken = zeroForOne ? token0 : token1;
      const inputAmount = zeroForOne ? amount0 : amount1; // positive

      const swapFee = poolSwapFees[j];
      // swap fee: exact per-swap overrideFee when present, else the pool's static fee
      const overrideFee = swapFee ? Number(swapFee.overrideFee) : 0;
      const feeRate = overrideFee > 0 ? overrideFee : staticFee;
      const pluginFee = swapFee ? Number(swapFee.pluginFee) : 0; // extra fee to the plugin

      const swapFeeAmount = (inputAmount * BigInt(feeRate)) / BigInt(FEE_DENOMINATOR);
      const pluginFeeAmount = (inputAmount * BigInt(pluginFee)) / BigInt(FEE_DENOMINATOR);
      // protocol cut = communityFee share of the swap fee + the whole plugin fee
      const protocolAmount = (swapFeeAmount * BigInt(communityFee)) / BigInt(COMMUNITY_FEE_DENOMINATOR) + pluginFeeAmount;
      const supplyAmount = swapFeeAmount + pluginFeeAmount - protocolAmount; // = LP share of the swap fee

      dailyVolume.add(inputToken, inputAmount);
      dailyFees.add(inputToken, swapFeeAmount + pluginFeeAmount);
      dailyRevenue.add(inputToken, protocolAmount);
      dailySupplySideRevenue.add(inputToken, supplyAmount);
    });
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Sum of the input amount of every swap across all Rooster V2 (Algebra Integral) pools on Plume, read from on-chain Swap events.",
  Fees: "Total swap fees paid by traders, computed per swap as inputAmount * (swapFee + pluginFee) using the exact per-swap rates from the pool's SwapFee event.",
  Revenue: "Protocol's share of fees: each pool's communityFee applied to its swap fees (read on-chain from globalState()) plus the full plugin fee.",
  ProtocolRevenue: "Protocol's share of fees (communityFee share of swap fees plus the plugin fee).",
  SupplySideRevenue: "Share of swap fees retained by liquidity providers (swap fees minus the communityFee share).",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.PLUME],
  start: "2025-08-23",
  methodology,
};

export default adapter;
