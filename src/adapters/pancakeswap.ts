import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getDexChainBreakdownFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "@defillama/adapters/volumes/adapters/pancakeswap";
import { FeeAdapter, BreakdownAdapter, Fetch } from "../utils/adapters.type";
import { CHAIN } from "@defillama/adapters/volumes/helper/chains";
import { getChainVolume } from "@defillama/adapters/volumes/helper/getUniSubgraphVolume";
import { getStartTimestamp } from "../helpers/getStartTimestamp";

const TOTAL_FEES = 0.0025;
const PROTOCOL_FEES = 0.0003;
const endpoints = {
  [CHAIN.BSC]: "https://bsc.streamingfast.io/subgraphs/name/pancakeswap/exchange-v2",
};

const DAILY_VOLUME_FACTORY = "pancakeDayData";

const graphs = getChainVolume({
  graphUrls: {
    [CHAIN.BSC]: endpoints[CHAIN.BSC],
  },
  totalVolume: {
    factory: "pancakeFactories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DAILY_VOLUME_FACTORY,
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
});

const breakdownAdapter: BreakdownAdapter = getDexChainBreakdownFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  volumeAdapter
});

const adapter: FeeAdapter = {
  breakdown: {
    ...breakdownAdapter,
    v2: {
      [CHAIN.BSC]: {
        fetch: graphs(CHAIN.BSC) as unknown as Fetch,
        start: getStartTimestamp({
          endpoints,
          chain: CHAIN.BSC,
          dailyDataField: `${DAILY_VOLUME_FACTORY}s`,
        }),
      },
    }
  }
};

export default adapter;
