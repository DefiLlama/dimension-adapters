import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { cache } from "@defillama/sdk";
import { ethers } from "ethers";
import { filterPools } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const FACTORY = "0xff8578c2949148a6f19b7958ae86caab2779cddd";
const POOL_CREATED_EVENT = "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";
const SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";
const SLOT0_ABI = "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)";

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;

  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${FACTORY}.json`;
  const iface = new ethers.Interface([POOL_CREATED_EVENT]);
  let { logs: cachedLogs } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!cachedLogs?.length) throw new Error("No pools found in cache");

  const pairObject: Record<string, string[]> = {};
  const poolFeeRates: Record<string, number> = {};

  cachedLogs
    .map((log: any) => iface.parseLog(log)?.args)
    .filter(Boolean)
    .forEach((log: any) => {
      pairObject[log.pool] = [log.token0, log.token1];
      poolFeeRates[log.pool] = Number(log.fee) / 1e6;
    });

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  const pools = Object.keys(filteredPairs);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  if (!pools.length) return { dailyFees, dailyRevenue, dailySupplySideRevenue };

  const [swapLogs, slot0Results] = await Promise.all([
    getLogs({ targets: pools, eventAbi: SWAP_EVENT, flatten: false }),
    api.multiCall({ abi: SLOT0_ABI, calls: pools, permitFailure: true }),
  ]);

  pools.forEach((pool, i) => {
    const logs = swapLogs[i];
    if (!logs?.length) return;

    const [token0, token1] = pairObject[pool];
    const feeRate = poolFeeRates[pool];

    let protocolRatio = 0;
    const slot0 = slot0Results[i];
    if (slot0) {
      const fp = Number(slot0.feeProtocol);
      const feeProtocol0 = fp & 0x0f;
      const feeProtocol1 = (fp >> 4) & 0x0f;
      if (feeProtocol0 > 0 && feeProtocol1 > 0) {
        const ratio0 = 1 / feeProtocol0
        const ratio1 = 1 / feeProtocol1
        protocolRatio = (ratio0 + ratio1) / 2
      }
      else if (feeProtocol0 > 0) protocolRatio = 1 / feeProtocol0;
      else if (feeProtocol1 > 0) protocolRatio = 1 / feeProtocol1;
    }

    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * feeRate, amount1: Number(log.amount1) * feeRate });
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: Number(log.amount0) * feeRate * protocolRatio, amount1: Number(log.amount1) * feeRate * protocolRatio });
      addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: Number(log.amount0) * feeRate * (1 - protocolRatio), amount1: Number(log.amount1) * feeRate * (1 - protocolRatio) });
    });
  });

  return { dailyFees, dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MORPH]: {
      fetch,
      start: "2024-10-29",
    },
  },
};

export default adapter;
