import { CHAIN } from "../../helpers/chains";
import { getMetricAdapter, MetricChainConfig } from "./utils";

const factory = "0xe22F9fc0f04486dE25ed6CF1800a4a47aFD82e0C";

const chainConfig: MetricChainConfig = {
  [CHAIN.ETHEREUM]: { fromBlock: 24521317, start: "2026-02-23" },
  [CHAIN.BASE]: { fromBlock: 42570144, start: "2026-04-05" },
  [CHAIN.ARBITRUM]: { fromBlock: 435210755, start: "2026-02-17" },
  [CHAIN.BSC]: { fromBlock: 82964761, start: "2026-02-23" },
  [CHAIN.AVAX]: { fromBlock: 78822864, start: "2026-02-23" },
  [CHAIN.POLYGON]: { fromBlock: 83380134, start: "2026-02-23" },
  [CHAIN.MEGAETH]: { fromBlock: 9083666, start: "2026-02-23" },
  [CHAIN.HYPERLIQUID]: { fromBlock: 30774348, start: "2026-03-26" },
  [CHAIN.MONAD]: { fromBlock: 64807339, start: "2026-03-30" },
  [CHAIN.ROBINHOOD]: { fromBlock: 9477535, start: "2026-07-14" },
};

const adapter = getMetricAdapter(factory, chainConfig);

export default adapter;
