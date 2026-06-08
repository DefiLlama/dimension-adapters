import type { FetchOptions, IJSON, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken, isCoreAsset } from "../helpers/prices";
import { filterPools } from "../helpers/uniswap";

// Not using the Uniswap/Algebra helper: Thirdfy pools are discovered from factory logs here,
// and Algebra Integral v4 fees need per-swap overrideFee/pluginFee handling.
const ABI = {
  pool: "event Pool(address indexed token0, address indexed token1, address pool)",
  swap: "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)",
  fee: "function fee() view returns (uint24)",
};

const chainConfig: Record<string, { start: string; factory: string; fromBlock: number }> = {
  [CHAIN.BASE]: {
    start: "2025-07-14",
    // Source: official Thirdfy contracts docs list Algebra Integral v4 on Base.
    factory: "0xEFCB993e113ea8197C17c6f4959495929Be0B68e",
    fromBlock: 27_278_505,
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const swapFees = options.createBalances();
  const lpFees = options.createBalances();
  const pluginFees = options.createBalances();
  const { factory, fromBlock } = chainConfig[options.chain];
  const poolLogs = await options.getLogs({
    target: factory,
    fromBlock,
    eventAbi: ABI.pool,
    cacheInCloud: true,
  });
  const pairObject = Object.fromEntries(poolLogs.map(({ token0, token1, pool }: any) => [pool, [token0, token1]])) as IJSON<[string, string]>;

  const filteredPairs = await filterPools({ api: options.api, pairs: pairObject, createBalances: options.createBalances });
  const pools = Object.keys(filteredPairs);

  if (pools.length) {
    const [poolFees, swapLogs] = await Promise.all([
      options.api.multiCall({ abi: ABI.fee, calls: pools, permitFailure: true }),
      // Kept flatten: false to keep logs grouped by pool so swapLogs[index] maps to pools[index].
      options.getLogs({ targets: pools, eventAbi: ABI.swap, flatten: false }),
    ]);

    swapLogs.forEach((logs: any[], index: number) => {
      const [token0, token1] = pairObject[pools[index]];
      const poolFee = Number(poolFees[index]);
      if (poolFees[index] == null || !Number.isFinite(poolFee)) {
        return;
      }
      const addFees = (balances: any, amount0: any, amount1: any, fee: number) => {
        const useToken0 = isCoreAsset(options.chain, token0);
        const token = useToken0 ? token0 : token1;
        const amount = BigInt((useToken0 ? amount0 : amount1).toString());
        const fees = ((amount < 0n ? -amount : amount) * BigInt(fee)) / 1_000_000n;
        balances.add(token, fees.toString());
      };

      logs.forEach(({ amount0, amount1, overrideFee, pluginFee }) => {
        const lpFee = Number(overrideFee || poolFee);
        const pluginFeeAmount = Number(pluginFee || 0);

        addOneToken({ chain: options.chain, balances: dailyVolume, token0, token1, amount0, amount1 });
        addFees(swapFees, amount0, amount1, lpFee + pluginFeeAmount);
        addFees(lpFees, amount0, amount1, lpFee);
        addFees(pluginFees, amount0, amount1, pluginFeeAmount);
      });
    });
  }

  const dailySupplySideRevenue = lpFees.clone(1, "Swap Fees To LPs");
  dailySupplySideRevenue.addBalances(pluginFees, "Plugin Fees");

  return {
    dailyVolume,
    dailyFees: swapFees.clone(1, "Swap Fees"),
    dailyUserFees: swapFees.clone(1, "Swap Fees"),
    dailyRevenue: 0,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Volume of all spot token swaps that go through the protocol.",
  Fees: "Swap fees paid by users.",
  UserFees: "Swap fees paid by users.",
  Revenue: "No protocol revenue.",
  SupplySideRevenue: "All swap fees distributed to liquidity provider or plugin-side.",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Trading fees paid by users on Thirdfy Algebra Integral swaps.",
  },
  UserFees: {
    "Swap Fees": "Trading fees paid directly by users on swaps.",
  },
  SupplySideRevenue: {
    "Swap Fees To LPs": "Trading fees distributed to liquidity providers.",
    "Plugin Fees": "Plugin fees charged on swaps by Algebra Integral plugins.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
