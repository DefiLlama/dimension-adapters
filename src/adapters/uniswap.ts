import { BreakdownAdapter, FeeAdapter } from "../utils/adapters.type";
import { ARBITRUM, ETHEREUM, OPTIMISM, POLYGON } from "../helpers/chains";
import { getStartTimestamp } from "../helpers/getStartTimestamp";
import { getDexChainBreakdownFees, getUniswapV3Fees } from "../helpers/getUniSubgraphFees";
import volumeAdapter from "@defillama/adapters/volumes/adapters/uniswap";

const v3Endpoints = {
  [ETHEREUM]: "https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3",
  [OPTIMISM]:
    "https://api.thegraph.com/subgraphs/name/ianlapham/optimism-post-regenesis",
  [ARBITRUM]:
    "https://api.thegraph.com/subgraphs/name/ianlapham/arbitrum-dev",
  [POLYGON]:
    "https://api.thegraph.com/subgraphs/name/ianlapham/uniswap-v3-polygon",
};


const VOLUME_USD = "volumeUSD";
const TOTAL_FEES = 0.003;

const v3Graphs = getUniswapV3Fees({
  ...v3Endpoints
});

const breakdownAdapter: BreakdownAdapter = getDexChainBreakdownFees({
  totalFees: TOTAL_FEES,
  volumeAdapter
});

const adapter: FeeAdapter = {
  breakdown: {
    ...breakdownAdapter,
    v3: {
      [ETHEREUM]: {
        fetch: v3Graphs(ETHEREUM),
        start: getStartTimestamp({
          endpoints: v3Endpoints,
          chain: ETHEREUM,
          volumeField: VOLUME_USD,
        }),
      },
      [ARBITRUM]: {
        fetch: v3Graphs(ARBITRUM),
        start: getStartTimestamp({
          endpoints: v3Endpoints,
          chain: ARBITRUM,
          volumeField: VOLUME_USD,
        }),
      },
      [POLYGON]: {
        fetch: v3Graphs(POLYGON),
        start: getStartTimestamp({
          endpoints: v3Endpoints,
          chain: POLYGON,
          volumeField: VOLUME_USD,
        }),
      },
      [OPTIMISM]: {
        fetch: v3Graphs(OPTIMISM),
        start: getStartTimestamp({
          endpoints: v3Endpoints,
          chain: OPTIMISM,
          volumeField: VOLUME_USD,
        }),
      },
    },
  }
}

export default adapter;
