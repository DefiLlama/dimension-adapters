import type { SimpleAdapter } from "../../adapters/types";
import type { FetchOptions, FetchResultV2, FetchV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const HUMAN_CONTRACT = "0xD8768f83FCD5C3f19FEf2024F2A2b6a384087E1e";
const FEE_RATIO = 0.01;

const abi = {
  SwapExecuted:
    "event SwapExecuted(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount, address[] path, uint24[] fees)",
};

export const fetchHumanFiData: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({
    target: HUMAN_CONTRACT,
    eventAbi: abi.SwapExecuted,
  });

  for (const log of logs) {
    const tokenIn: string = log.tokenIn;
    const amountIn: bigint = BigInt(log.amountIn);

    dailyVolume.add(tokenIn, amountIn);
  }

  const dailyFees = dailyVolume.clone(FEE_RATIO);

  return {
    dailyVolume,
    dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetch: FetchV2 = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { dailyVolume } = await fetchHumanFiData(options)
  return {
    dailyVolume,
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.WC]: {
      fetch: fetch,
      start: "2025-04-19",
    },
  },
  methodology: {
    dailyVolume: "Volume is calculated as the sum of all amountIn in SwapExecuted events",
  },
};

export default adapter;
