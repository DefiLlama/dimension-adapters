import type { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const FACTORY = "0x630db8e822805c82ca40a54dae02dd5ac31f7fcf";
const SWAP_EVENT =
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";
const FEE_RATE = 0.003;

const HOLDERS_REVENUE_RATIO = 0.08 / 0.25;
const SUPPLY_SIDE_REVENUE_RATIO = 0.17 / 0.25;

const methodology = {
  Fees:
    "Calculated from on-chain Swap logs on X Layer across all PotatoSwap v2 pairs discovered from the v2 factory. Fees use the standard pair Swap event and a 0.3% fee rate.",
  UserFees:
    "Users pay a 0.3% fee on swaps across all PotatoSwap v2 pairs.",
  SupplySideRevenue:
    "68% of the tracked fees are attributed to liquidity providers, preserving the existing PotatoSwap v2 revenue split.",
  HoldersRevenue:
    "32% of the tracked fees are attributed to vePOT holders, preserving the existing PotatoSwap v2 revenue split.",
  ProtocolRevenue:
    "No direct protocol revenue is assigned in the PotatoSwap v2 adapter.",
};

const fetch = async (options: FetchOptions) => {
  const { chain, createBalances, api, getLogs } = options;

  const allPairsLength = await api.call({
    target: FACTORY,
    abi: "uint256:allPairsLength",
  });

  const pairCalls = Array.from({ length: Number(allPairsLength) }, (_, i) => ({
    params: [i],
  }));

  const allPairs = await api.multiCall({
    target: FACTORY,
    abi: "function allPairs(uint256) view returns(address)",
    calls: pairCalls,
  });

  const [token0s, token1s] = await Promise.all([
    api.multiCall({
      abi: "address:token0",
      calls: allPairs,
    }),
    api.multiCall({
      abi: "address:token1",
      calls: allPairs,
    }),
  ]);

  const pairTokens = allPairs.reduce<Record<string, [string, string]>>((acc, pair, i) => {
    acc[String(pair).toLowerCase()] = [String(token0s[i]), String(token1s[i])];
    return acc;
  }, {});

  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const logsByPair = await getLogs({
    targets: allPairs,
    eventAbi: SWAP_EVENT,
    flatten: false,
  });

  allPairs.forEach((pair, index) => {
    const logs = logsByPair[index] || [];
    const tokens = pairTokens[String(pair).toLowerCase()];
    if (!tokens) return;

    const [token0, token1] = tokens;
    logs.forEach((log: any) => {
      addOneToken({
        chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: log.amount0In,
        amount1: log.amount1In,
      });
      addOneToken({
        chain,
        balances: dailyVolume,
        token0,
        token1,
        amount0: log.amount0Out,
        amount1: log.amount1Out,
      });
      addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: Number(log.amount0In) * FEE_RATE,
        amount1: Number(log.amount1In) * FEE_RATE,
      });
      addOneToken({
        chain,
        balances: dailyFees,
        token0,
        token1,
        amount0: Number(log.amount0Out) * FEE_RATE,
        amount1: Number(log.amount1Out) * FEE_RATE,
      });
    });
  });

  const dailyHoldersRevenue = dailyFees.clone(HOLDERS_REVENUE_RATIO);
  const dailySupplySideRevenue = dailyFees.clone(SUPPLY_SIDE_REVENUE_RATIO);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.XLAYER]: {
      fetch,
      runAtCurrTime: true,
      start: "2024-04-23",
    },
  },
};

export default adapter;
