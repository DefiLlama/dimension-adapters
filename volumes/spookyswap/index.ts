import { SimpleAdapter } from "../../adapters/types";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const { getChainVolume } = require("../../helpers/getUniSubgraphVolume");
const { FANTOM } = require("../../helpers/chains");
const endpoints = {
  [FANTOM]: "https://api.thegraph.com/subgraphs/name/eerieeight/spookyswap",
};

const graphs = getChainVolume({
  graphUrls: {
    [FANTOM]: endpoints[FANTOM],
  },
});

const adapter: SimpleAdapter = {
  adapter: {
    [FANTOM]: {
      fetch: graphs(FANTOM),
      start: getStartTimestamp({
        endpoints,
        chain: FANTOM
      }),
    },
  },
};

export default adapter;
