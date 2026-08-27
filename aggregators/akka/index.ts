import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {METRIC} from "../../helpers/metrics";

const swapEvent =
  "event Swap(address indexed _from, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee)";

type ChainConfig = {
  routers: string[];
  start: string;
  deadFrom?: string;
  fetch: typeof fetch;
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const { routers } = chainConfig[options.chain];

  const logs = await options.getLogs({
    targets: routers,
    eventAbi: swapEvent,
  });

  for (const log of logs) {
    dailyVolume.add(log.tokenIn, log.amountIn);
    dailyFees.add(log.tokenOut, log.fee, METRIC.SWAP_FEES);
    dailyRevenue.add(log.tokenOut, log.fee, "Swap fees to protocol");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const chainConfig: Record<string, ChainConfig> = {
  // AKKA Router on HyperEVM; source: https://docs.akka.finance/smart-contracts
  hyperliquid: {
    routers: ["0xcce7452db4392b40aa0e1592a7c486e13bf69654"],
    start: "2026-01-20",
    fetch,
  },
  // AKKA Router on XDC Network; source: https://docs.akka.finance/smart-contracts
  [CHAIN.XDC]: {
    routers: ["0x9afd9c2c9cbe15ac03eb2f42555e0c6f484ec3f3"],
    start: "2024-10-29",
    fetch,
  },
  // Historical AKKA Router on Core; source: https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/akka/index.ts
  [CHAIN.CORE]: {
    routers: [
      // Historical AKKA Core router; source: https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/akka/index.ts
      "0x7C5Af181D9e9e91B15660830B52f7B7076Be0d64",
      // Historical AKKA Core router; source: https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/akka/index.ts
      "0x5f3B7b49c5763045a6571dEe9A2b13ccd2407daA",
      // Historical AKKA Core router; source: https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/akka/index.ts
      "0x0cfedb22dbda450077dc64d21f58ad8ff3646036",
    ],
    start: "2023-11-19",
    deadFrom: "2026-05-14",
    fetch,
  },
  // Historical AKKA Router on Bitlayer; source: https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/akka/index.ts
  [CHAIN.BITLAYER]: {
    routers: ["0x4822b754118e066bf9dccf8b8f105f8b47bb4502"],
    start: "2024-10-29",
    deadFrom: "2026-01-13",
    fetch,
  },
  // Historical AKKA Router on B2 Network; source: https://github.com/DefiLlama/dimension-adapters/blob/master/aggregators/akka/index.ts
  [CHAIN.BSQUARED]: {
    routers: ["0x70D80feb53005272E81F3493a69177911D458CbA"],
    start: "2024-10-29",
    deadFrom: "2026-01-26",
    fetch,
  },
};

const methodology = {
  Volume: "Volume is calculated from Swap events emitted by the AkkaRouter contracts.",
  Fees: "Fees are tracked from the fee field in Swap events, denominated in the output token.",
  Revenue: "All the fees from swap events go to the protocol.",
  ProtocolRevenue: "All the fees from swap events go to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees are tracked from the fee field in Swap events, denominated in the output token.",
  },
  Revenue: {
    "Swap fees to protocol": "All the fees from swap events go to the protocol.",
  },
  ProtocolRevenue: {
    "Swap fees to protocol": "All the fees from swap events go to the protocol.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
