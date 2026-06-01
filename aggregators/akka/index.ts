import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const swapEvent =
  "event Swap(address indexed _from, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee)";

const config: Record<string, { targets: string[]; start: string; end?: string }> = {
  [CHAIN.HYPERLIQUID]: {
    targets: ["0xcce7452db4392b40aa0e1592a7c486e13bf69654"],
    start: "2026-01-20",
  },
  [CHAIN.CORE]: {
    targets: [
      "0x7C5Af181D9e9e91B15660830B52f7B7076Be0d64",
      "0x5f3B7b49c5763045a6571dEe9A2b13ccd2407daA",
      "0x0cfedb22dbda450077dc64d21f58ad8ff3646036",
    ],
    start: "2023-11-19",
    end: "2026-05-14",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { targets } = config[options.chain];

  const logs = await options.getLogs({
    targets,
    eventAbi: swapEvent,
  });

  logs.forEach((log: any) => {
    dailyVolume.add(log.tokenIn, log.amountIn);
  });

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.entries(config).reduce((acc, [chain, { start, end }]) => {
    acc[chain] = { fetch, start, ...(end ? { end } : {}) };
    return acc;
  }, {} as any),
};

export default adapter;
