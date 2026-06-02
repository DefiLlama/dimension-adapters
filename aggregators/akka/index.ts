import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const swapEvent =
  "event Swap(address indexed _from, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee)";

const config: Record<string, { targets: string[]; start: string; end?: string }> = {
  [CHAIN.HYPERLIQUID]: {
    targets: ["0xcce7452db4392b40aa0e1592a7c486e13bf69654"],
    start: "2026-01-20",
  },
  [CHAIN.XDC]: {
    targets: ["0x9afd9c2c9cbe15ac03eb2f42555e0c6f484ec3f3"],
    start: "2024-10-29",
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
  [CHAIN.BITLAYER]: {
    targets: ["0x4822b754118e066bf9dccf8b8f105f8b47bb4502"],
    start: "2024-10-29",
    end: "2026-01-13",
  },
  [CHAIN.BSQUARED]: {
    targets: ["0x70D80feb53005272E81F3493a69177911D458CbA"],
    start: "2024-10-29",
    end: "2026-01-26",
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
