import { cache } from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { filterPools } from "../helpers/uniswap";
import { addOneToken } from "../helpers/prices";

const FACTORY = "0xBB24AF5c6fB88F1d191FA76055e30BF881BeEb79";
const SWAP_EVENT = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;
  const factory = FACTORY.toLowerCase();
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${factory}-${chain}.json`;

  const { pairs, token0s, token1s } = await cache.readCache(cacheKey, { readFromR2Cache: true });
  if (!pairs?.length) throw new Error("No pairs found, is there TVL adapter for this already?");

  const pairObject: Record<string, string[]> = {};
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]];
  });

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances });
  const pairIds = Object.keys(filteredPairs);

  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  if (!pairIds.length) return { dailyVolume, dailyFees };

  const poolFees = await api.multiCall({ abi: "uint24:fee", calls: pairIds, permitFailure: true });

  const allLogs = await getLogs({ targets: pairIds, eventAbi: SWAP_EVENT, flatten: false });
  allLogs.forEach((logs: any[], index: number) => {
    if (!logs.length) return;
    const pair = pairIds[index];
    const [token0, token1] = pairObject[pair];
    const feeRate = Number(poolFees[index]) / 1e6;
    logs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 });
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: Number(log.amount0) * feeRate, amount1: Number(log.amount1) * feeRate });
    });
  });

  const dailySupplySideRevenue = dailyFees.clone(1);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.MEZO],
  start: "2026-01-12",
  methodology: {
    Fees: "Per-pool swap fees charged on input amount.",
    UserFees: "Per-pool swap fees charged on input amount.",
    SupplySideRevenue: "All swap fees are distributed to liquidity providers.",
    Revenue: "No protocol revenue.",
    ProtocolRevenue: "No protocol revenue.",
  },
};

export default adapter;
