import { SimpleAdapter } from "../../adapters/types";
import { DEFAULT_TOTAL_VOLUME_FIELD, getChainVolume2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ROLLUX]: "https://rollux.graph.pegasys.fi/subgraphs/name/pollum-io/pegasys-v3",
};

const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
});
// rollux
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ROLLUX]: {
      // The old function is retained so that historical data from before 05-03 remains intact
      fetch: graphs(CHAIN.ROLLUX),
      start: '2023-06-30',
      deadFrom: '2026-05-03', // subgraph dark since this date (see #8921); only activity
      // after this is a single-wallet arb burst 06-03 -> 06-10-2026,
      // on-chain scan proves 0 organic trading activity since
      // not organic volume — see PR description for full analysis
    },
  },
};

export default adapter;
