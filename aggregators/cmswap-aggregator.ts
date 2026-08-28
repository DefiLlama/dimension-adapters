import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const AGG_ROUTER = "0x869A40921A332e0D79300F91361A3DC77F2a0ebc";

const AGGREGATED_ABI =
  "event Aggregated(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 legs, address referrer)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyVolume = createBalances();
  const dailyFees = createBalances();

  const aggLogs = await getLogs({ target: AGG_ROUTER, eventAbi: AGGREGATED_ABI });
  for (const log of aggLogs) {
    addOneToken({ chain, balances: dailyVolume, token0: log.tokenIn, amount0: log.amountIn, token1: log.tokenOut, amount1: log.amountOut });
    dailyFees.add(log.tokenOut, log.fee, "Aggregator router fee");
  }

  return { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Volume: "Swap volume routed through the Junoswap Aggregator Router (multi-DEX best-price routing across several Bitkub Chain DEXs).",
  Fees: "The router-skim fee (feeBps) deducted from swap output on the Junoswap Aggregator Router.",
  Revenue: "All the aggregator fees accrue to the Junoswap protocol treasury.",
  ProtocolRevenue: "All the aggregator fees accrue to the Junoswap protocol treasury.",
};

const breakdownMethodology = {
  Fees: {
    "Aggregator router fee": "The router-skim fee (feeBps) deducted from swap output on the Junoswap Aggregator Router.",
  },
  Revenue: {
    "Aggregator router fee": "The router-skim fee (feeBps) deducted from swap output on the Junoswap Aggregator Router.",
  },
  ProtocolRevenue: {
    "Aggregator router fee": "The router-skim fee (feeBps) deducted from swap output on the Junoswap Aggregator Router.",
  },
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-06-17",
  chains: [CHAIN.BITKUB],
  methodology,
  breakdownMethodology,
};

export default adapter;