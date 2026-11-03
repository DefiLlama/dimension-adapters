import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchV2, IJSON } from "../adapters/types";
import { filterPools } from "./uniswap";
import { addOneToken } from "./prices";
import { METRIC } from "./metrics";

// Algebra Integral <1.2: a swap pays globalState().fee, changed only by Fee events logged before it
const poolEvent = "event Pool(address indexed token0, address indexed token1, address pool)";
const swapEvent = "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick)";
const feeEvent = "event Fee(uint16 fee)";
const communityFeeEvent = "event CommunityFee(uint16 communityFeeNew)";

const abis = {
  globalState: "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
  communityVault: "address:communityVault",
  algebraFee: "function algebraFee() view returns (uint16)",
};

// private constants in the Algebra contracts
const FEE_DENOMINATOR = 1e6; // globalState().fee
const COMMUNITY_FEE_DENOMINATOR = 1e3; // globalState().communityFee
const ALGEBRA_FEE_DENOMINATOR = 1e3; // AlgebraCommunityVault.algebraFee

export const ALGEBRA_INTEGRAL_LABELS = {
  SWAP_FEES: METRIC.SWAP_FEES,
  LP_FEES: METRIC.LP_FEES,
  ALGEBRA_FEES: "Swap Fees To Algebra",
  PROTOCOL_FEES: "Swap Fees To Protocol",
};

type AlgebraIntegralConfig = {
  factory: string;
  // factory deploy block
  fromBlock: number;
  // community vaults that are the receiver itself (no Algebra cut)
  directVaults?: string[];
};

type Point = { block: number; index: number; value: number };

const toPoint = (log: any, value: any): Point => ({
  block: Number(log.blockNumber),
  index: Number(log.logIndex ?? log.index),
  value: Number(value),
});

const byPosition = (a: Point, b: Point) => a.block - b.block || a.index - b.index;

export function getAlgebraIntegralFetch({ factory, fromBlock, directVaults = [] }: AlgebraIntegralConfig): FetchV2 {
  const direct = new Set(directVaults.map((v) => v.toLowerCase()));

  return async (options: FetchOptions) => {
    const { createBalances, getLogs, chain, api } = options;
    const dailyVolume = createBalances();
    const dailyFees = createBalances();
    const dailySupplySideRevenue = createBalances();
    const dailyRevenue = createBalances();
    const response = {
      dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailySupplySideRevenue,
      dailyHoldersRevenue: 0,
    };

    const poolLogs = await getLogs({ target: factory, eventAbi: poolEvent, fromBlock, cacheInCloud: true });
    const pairObject: IJSON<string[]> = {};
    poolLogs.forEach((log: any) => {
      pairObject[log.pool.toLowerCase()] = [log.token0, log.token1];
    });
    const pools = Object.keys(await filterPools({ api, pairs: pairObject, createBalances }));
    if (!pools.length) return response;

    // pre-window rates (api.multiCall ignores a block param), new pools revert and get theirs from init events
    const apiBeforeWindow = new ChainApi({ chain, block: (await options.getFromBlock()) - 1 });
    const [states, vaults] = await Promise.all([
      apiBeforeWindow.multiCall({ abi: abis.globalState, calls: pools, permitFailure: true }),
      api.multiCall({ abi: abis.communityVault, calls: pools }),
    ]);

    const algebraVaults = [...new Set(vaults.map((v: string) => v.toLowerCase()))].filter((v) => !direct.has(v));
    const algebraFees = await api.multiCall({ abi: abis.algebraFee, calls: algebraVaults });
    const algebraShare: IJSON<number> = {};
    algebraVaults.forEach((vault, i) => { algebraShare[vault] = Number(algebraFees[i]) / ALGEBRA_FEE_DENOMINATOR; });
    direct.forEach((vault) => { algebraShare[vault] = 0; });

    const logOptions = { targets: pools, flatten: false, entireLog: true } as const;
    const [swapLogs, feeLogs, communityFeeLogs] = await Promise.all([
      getLogs({ ...logOptions, eventAbi: swapEvent }),
      getLogs({ ...logOptions, eventAbi: feeEvent }),
      getLogs({ ...logOptions, eventAbi: communityFeeEvent }),
    ]);

    pools.forEach((pool, i) => {
      const swaps = (swapLogs[i] ?? []).map((log: any) => ({ ...toPoint(log, 0), args: log.args })).sort(byPosition);
      if (!swaps.length) return;

      const [token0, token1] = pairObject[pool];
      const toAlgebra = algebraShare[vaults[i].toLowerCase()];
      const feeChanges = (feeLogs[i] ?? []).map((log: any) => toPoint(log, log.args.fee)).sort(byPosition);
      const communityFeeChanges = (communityFeeLogs[i] ?? []).map((log: any) => toPoint(log, log.args.communityFeeNew)).sort(byPosition);

      let fee: number | undefined = states[i] ? Number(states[i].fee) : undefined;
      let communityFee: number | undefined = states[i] ? Number(states[i].communityFee) : undefined;
      let nextFee = 0;
      let nextCommunityFee = 0;

      swaps.forEach((swap: any) => {
        while (nextFee < feeChanges.length && byPosition(feeChanges[nextFee], swap) < 0) fee = feeChanges[nextFee++].value;
        while (nextCommunityFee < communityFeeChanges.length && byPosition(communityFeeChanges[nextCommunityFee], swap) < 0) communityFee = communityFeeChanges[nextCommunityFee++].value;
        if (fee === undefined || communityFee === undefined)
          throw new Error(`algebraIntegral: no fee state for pool ${pool} on ${chain} at block ${swap.block}`);

        const { token, amount } = addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: swap.args.amount0, amount1: swap.args.amount1 });
        const swapFee = amount * fee / FEE_DENOMINATOR;
        const toCommunity = swapFee * communityFee / COMMUNITY_FEE_DENOMINATOR;
        const algebraCut = toCommunity * toAlgebra;

        dailyFees.add(token, swapFee, ALGEBRA_INTEGRAL_LABELS.SWAP_FEES);
        dailySupplySideRevenue.add(token, swapFee - toCommunity, ALGEBRA_INTEGRAL_LABELS.LP_FEES);
        dailySupplySideRevenue.add(token, algebraCut, ALGEBRA_INTEGRAL_LABELS.ALGEBRA_FEES);
        dailyRevenue.add(token, toCommunity - algebraCut, ALGEBRA_INTEGRAL_LABELS.PROTOCOL_FEES);
      });
    });

    return response;
  };
}
