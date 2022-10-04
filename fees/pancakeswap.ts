import { DEFAULT_DAILY_VOLUME_FIELD, DEFAULT_TOTAL_VOLUME_FIELD, getDexChainBreakdownFees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "../volumes/pancakeswap";
import { FeeAdapter, BreakdownAdapter, Fetch } from "../adapters.type";
import { CHAIN } from "../helper/chains";
import { getChainVolume } from "../helper/getUniSubgraphVolume";
import { getStartTimestamp } from "../helper/getStartTimestamp";

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
