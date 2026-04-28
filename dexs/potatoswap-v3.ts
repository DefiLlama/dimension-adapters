import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";
import { ethers } from "ethers";

const FACTORY = "0xa1415fAe79c4B196d087F02b8aD5a622B8A827E5";
const FACTORY_FROM_BLOCK = 38145900;
const POOL_CREATED_EVENT =
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const SLOT0_ABI =
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";
const FEE_ABI = "function fee() view returns (uint24)";
const DEFAULT_FEE_RATE = 0.003;

function getProtocolRevenueRatio(slot0: any, token0In: boolean): number {
  const feeProtocolValue = Number(slot0?.feeProtocol ?? 0);
  const denominator = token0In
    ? (feeProtocolValue & 0x0f)
    : ((feeProtocolValue >> 4) & 0x0f);

  return denominator > 0 ? 1 / denominator : 0;
}

const methodology = {
  Fees:
    "Calculated from on-chain Swap logs on X Layer across all PotatoSwap v3 pools discovered from the v3 factory. Each pool uses its on-chain fee tier.",
  UserFees:
    "Users pay each pool's on-chain fee tier on swaps across all PotatoSwap v3 pools.",
  Revenue:
    "Protocol revenue is reconstructed from on-chain Swap logs and each pool's current feeProtocol bits read from slot0().",
  ProtocolRevenue:
    "Protocol revenue uses the Uniswap v3-style feeProtocol split encoded in slot0(), selected per swap direction.",
  SupplySideRevenue:
    "Supply-side revenue is the remainder of tracked fees after the on-chain protocol revenue share is removed.",
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, api, getLogs } = options;

  const poolCreatedLogs = await getLogs({
    target: FACTORY,
    eventAbi: POOL_CREATED_EVENT,
    fromBlock: FACTORY_FROM_BLOCK,
    entireLog: true,
    cacheInCloud: true,
  });

  const iface = new ethers.Interface([POOL_CREATED_EVENT]);
  const pools = poolCreatedLogs
    .map((log: any) => iface.parseLog(log)?.args)
    .filter(Boolean)
    .map((log: any) => ({
      address: String(log.pool),
      token0: String(log.token0),
      token1: String(log.token1),
      feeFromEvent: Number(log.fee ?? 0) / 1e6,
    }));

  const poolAddresses = pools.map((pool) => pool.address);
  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  if (!poolAddresses.length) {
    return {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  }

  const [feeResults, slot0Results, logsByPool] = await Promise.all([
    api.multiCall({
      abi: FEE_ABI,
      calls: poolAddresses,
      chain: CHAIN.XLAYER,
      permitFailure: true,
    }),
    api.multiCall({
      abi: SLOT0_ABI,
      calls: poolAddresses,
      chain: CHAIN.XLAYER,
      permitFailure: true,
    }),
    getLogs({
      targets: poolAddresses,
      eventAbi: SWAP_EVENT,
      flatten: false,
    }),
  ]);

  pools.forEach((pool, index) => {
    const logs = logsByPool[index] || [];
    const feeRate = feeResults[index]
      ? Number(feeResults[index]) / 1e6
      : pool.feeFromEvent || DEFAULT_FEE_RATE;

    logs.forEach((log: any) => {
      const token0In = Number(log.amount0) > 0;
      const protocolRevenueRatio = getProtocolRevenueRatio(slot0Results[index], token0In);
      const supplySideRatio = 1 - protocolRevenueRatio;

      addOneToken({
        chain,
        balances: dailyVolume,
        token0: pool.token0,
        token1: pool.token1,
        amount0: log.amount0,
        amount1: log.amount1,
      });
      addOneToken({
        chain,
        balances: dailyFees,
        token0: pool.token0,
        token1: pool.token1,
        amount0: Number(log.amount0) * feeRate,
        amount1: Number(log.amount1) * feeRate,
      });
      if (protocolRevenueRatio > 0) {
        addOneToken({
          chain,
          balances: dailyRevenue,
          token0: pool.token0,
          token1: pool.token1,
          amount0: Number(log.amount0) * feeRate * protocolRevenueRatio,
          amount1: Number(log.amount1) * feeRate * protocolRevenueRatio,
        });
      }
      addOneToken({
        chain,
        balances: dailySupplySideRevenue,
        token0: pool.token0,
        token1: pool.token1,
        amount0: Number(log.amount0) * feeRate * supplySideRatio,
        amount1: Number(log.amount1) * feeRate * supplySideRatio,
      });
    });
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

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      runAtCurrTime: true,
      start: "2025-11-10",
    },
  },
};

export default adapter;
