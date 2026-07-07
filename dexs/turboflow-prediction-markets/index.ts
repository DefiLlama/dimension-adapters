import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchTurboFlowMetrics, shouldReturnProtocolMetrics } from "../../helpers/turboflow";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  // All prediction-market fees (event + football contracts) accrue to the protocol.
  const result = { dailyVolume, dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
  if (!shouldReturnProtocolMetrics(options)) return result;

  const metrics = await fetchTurboFlowMetrics(options);
  dailyVolume.addUSDValue(metrics.predictionMarketVolumeUsd);
  dailyFees.addUSDValue(metrics.predictionMarketFeesUsd);

  return result;
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC, CHAIN.SOLANA],
  start: "2025-10-19",
  methodology: {
    Volume:
      "Prediction Market Volume reports TurboFlow prediction-market turnover from TurboFlow's production indexer. The aggregate includes event contracts and football markets. Volume is reported single-sided: each trade is counted once at its executed notional, and entering and exiting a position are each counted as a trade; bid/ask sides are not double-counted.",
    Fees: "Prediction-market fees paid by users on event contracts and football markets, from TurboFlow's production indexer.",
    Revenue: "All prediction-market fees accrue to the protocol (no rebates or LP-vault share).",
    ProtocolRevenue: "All prediction-market fees accrue to the protocol.",
  },
};

export default adapter;
