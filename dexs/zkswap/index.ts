import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/60365/zksync-zkswap/v0.0.5"
}

const blacklistTokens = {
  [CHAIN.ERA]: [
    '0x47260090ce5e83454d5f05a0abbb2c953835f777'
  ]
}

const graph = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "uniswapFactories",
    field: "totalVolumeUSD",
  },
  blacklistTokens
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: graph(CHAIN.ERA),
      start: '2023-11-21',
    }
  }
}
export default adapters;
