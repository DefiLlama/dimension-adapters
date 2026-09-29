import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { addOneToken } from "../../helpers/prices";

// Felynx (https://felynx.xyz), a DEX aggregator on Flare that splits and hops swaps across SparkDEX, Enosys, BlazeSwap
// and Sceptre. FelynxRouter is ownerless and verified on the Flare explorer; every swap emits Swapped. v2 (28 Sep 2026)
// is the same verified code as v1 with a higher fee cap; both are read.
// amountIn is the full input and includes the Felynx fee; the fee is taken in the input token and sent to the treasury.
// A swap paid in native FLR is recorded with tokenIn = WFLR.
const ROUTERS = [
  "0xF4b35163F9d63800e708e262cE10dF67eFCf3073", // FelynxRouter v1
  "0x06dC3Dc709fB3C593Fd38782237Ed36225d1Df31", // FelynxRouter v2
];

const swappedEvent =
  "event Swapped(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, address recipient, address ref)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const logs = await options.getLogs({ targets: ROUTERS, eventAbi: swappedEvent });

  for (const log of logs) {
    addOneToken({ balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
    dailyFees.add(log.tokenIn, log.fee, METRIC.SWAP_FEES);
    dailyRevenue.add(log.tokenIn, log.fee, "Swap fees to protocol");
  }

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue };
};

const methodology = {
  Volume: "Volume is the input amount of every swap, from the Swapped events emitted by the FelynxRouter contracts (v1 and v2). A swap paid in a token without a reliable price is valued by its output when the output is a core asset (WFLR, USDT0, FXRP, sFLR...).",
  Fees: "Fees are tracked from the fee field in Swapped events, denominated in the input token. A swap is free unless its route beats the best single DEX by at least 0.1%, counted after gas; the fee is then at most 0.5% (0.05% between stablecoins; 0.15% on router v1).",
  Revenue: "All swap fees go to the Felynx treasury.",
  ProtocolRevenue: "All swap fees go to the Felynx treasury.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Fees are tracked from the fee field in Swapped events, denominated in the input token.",
  },
  Revenue: {
    "Swap fees to protocol": "All swap fees go to the Felynx treasury.",
  },
  ProtocolRevenue: {
    "Swap fees to protocol": "All swap fees go to the Felynx treasury.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.FLARE]: { fetch, start: "2026-09-25" },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
