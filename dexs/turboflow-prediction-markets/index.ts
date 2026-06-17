import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchTurboFlowMetrics, shouldReturnProtocolMetrics } from "../../helpers/turboflow";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  if (!shouldReturnProtocolMetrics(options)) return { dailyVolume };

  const metrics = await fetchTurboFlowMetrics(options);
  dailyVolume.addUSDValue(metrics.predictionMarketVolumeUsd);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC, CHAIN.SOLANA],
  start: "2025-10-19",
  methodology: {
    Volume:
      "Prediction Market Volume reports TurboFlow prediction-market turnover from TurboFlow's production indexer. The aggregate includes event contracts and football markets.",
  },
};

export default adapter;
