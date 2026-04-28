import type { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const SWAP_EVENT =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const SLOT0_ABI =
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";
const FEE_ABI = "function fee() view returns (uint24)";
const DEFAULT_FEE_RATE = 0.003;

const POOLS = [
  {
    address: "0x03e09b72616f247766d13c08269739a97a93b7dc",
    token0: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
    token1: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    name: "USDT/USDT0",
  },
  {
    address: "0x934d61904f577121e6c0be3e0dd527564149fc75",
    token0: "0x3cfbcebf998a27007326d18cffa5ba9cad041111",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "PANGJU/WOKB",
  },
  {
    address: "0xd93080f0f67259a2a1074340024ee0d0c4cea3e2",
    token0: "0x6ab3aaa5dc7b8cbb59f17aa70d33d2d13af11111",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "BAOBAO/WOKB",
  },
];

function getProtocolRevenueRatio(slot0: any): number {
  if (!slot0) return 0;

  const feeProtocolValue = Number(slot0.feeProtocol);
  const feeProtocol0 = feeProtocolValue & 0x0f;
  const feeProtocol1 = (feeProtocolValue >> 4) & 0x0f;

  if (feeProtocol0 > 0 && feeProtocol1 > 0)
    return ((1 / feeProtocol0) + (1 / feeProtocol1)) / 2;
  if (feeProtocol0 > 0) return 1 / feeProtocol0;
  if (feeProtocol1 > 0) return 1 / feeProtocol1;
  return 0;
}

const fetch = async (_timestamp: number, _chainBlocks: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const poolAddresses = POOLS.map((pool) => pool.address);
  const [feeResults, slot0Results, logsByPool] = await Promise.all([
    options.api.multiCall({
      abi: FEE_ABI,
      calls: poolAddresses,
      chain: CHAIN.XLAYER,
      permitFailure: true,
    }),
    options.api.multiCall({
      abi: SLOT0_ABI,
      calls: poolAddresses,
      chain: CHAIN.XLAYER,
      permitFailure: true,
    }),
    options.getLogs({
      targets: poolAddresses,
      eventAbi: SWAP_EVENT,
      flatten: false,
    }),
  ]);

  POOLS.forEach((pool, index) => {
    const logs = logsByPool[index] || [];
    const feeRate = feeResults[index] ? Number(feeResults[index]) / 1e6 : DEFAULT_FEE_RATE;
    const protocolRevenueRatio = getProtocolRevenueRatio(slot0Results[index]);
    const supplySideRatio = 1 - protocolRevenueRatio;

    logs.forEach((log: any) => {
      addOneToken({
        chain: options.chain,
        balances: dailyVolume,
        token0: pool.token0,
        token1: pool.token1,
        amount0: log.amount0,
        amount1: log.amount1,
      });
      addOneToken({
        chain: options.chain,
        balances: dailyFees,
        token0: pool.token0,
        token1: pool.token1,
        amount0: Number(log.amount0) * feeRate,
        amount1: Number(log.amount1) * feeRate,
      });
      if (protocolRevenueRatio > 0) {
        addOneToken({
          chain: options.chain,
          balances: dailyRevenue,
          token0: pool.token0,
          token1: pool.token1,
          amount0: Number(log.amount0) * feeRate * protocolRevenueRatio,
          amount1: Number(log.amount1) * feeRate * protocolRevenueRatio,
        });
      }
      addOneToken({
        chain: options.chain,
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

const methodology = {
  Fees:
    "Calculated from on-chain Swap logs on X Layer across core PotatoSwap v3 pools (USDT/USDT0, PANGJU/WOKB, BAOBAO/WOKB) using standard concentrated-liquidity Swap events and each pool's on-chain fee tier.",
  UserFees:
    "Users pay each pool's on-chain fee tier on swaps in the tracked core PotatoSwap v3 pools.",
  Revenue:
    "Protocol revenue is reconstructed from on-chain Swap logs and each pool's current feeProtocol bits read from slot0().",
  ProtocolRevenue:
    "Protocol revenue uses the Uniswap v3-style feeProtocol split encoded in slot0() for the tracked core PotatoSwap v3 pools.",
  SupplySideRevenue:
    "Supply-side revenue is the remainder of tracked fees after the on-chain protocol revenue share is removed.",
};

const adapter: SimpleAdapter = {
  version: 1,
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
