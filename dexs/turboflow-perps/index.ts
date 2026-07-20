import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchTurboFlowMetrics, shouldReturnProtocolMetrics } from "../../helpers/turboflow";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  // All perp fees (flat trading fee + profit share) accrue to the protocol.
  const result = { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  if (!shouldReturnProtocolMetrics(options)) return result;

  const metrics = await fetchTurboFlowMetrics(options);
  dailyVolume.addUSDValue(metrics.perpVolumeUsd);
  dailyFees.addUSDValue(metrics.perpFeesUsd);

  return result;
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC, CHAIN.SOLANA],
  start: "2025-10-19",
  methodology: {
    Volume:
      "Perp Volume reports TurboFlow perpetual contract traded notional from TurboFlow's production indexer. Volume is reported single-sided: each trade is counted once at its executed notional, and a position's open and close are each counted as a trade, consistent with standard perp volume reporting (e.g. GMX, gTrade); bid/ask sides are not double-counted. Prediction-market activity is intentionally excluded and submitted separately.",
    Fees: "Perp trading fees paid by users: the flat trading fee plus the profit-share fee taken on winning positions, from TurboFlow's production indexer.",
    Revenue: "All perp trading fees accrue to the protocol (no rebates or LP-vault share).",
    ProtocolRevenue: "All perp trading fees accrue to the protocol.",
  },
};

export default adapter;
