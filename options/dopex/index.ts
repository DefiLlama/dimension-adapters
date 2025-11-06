import { SimpleAdapter } from "../../adapters/types";
import { getChainStats } from "./clamm";
import { CHAIN } from "../../helpers/chains";

const clammEndpoints: { [chain: string]: string } = {
  [CHAIN.ARBITRUM]:
    "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-arbitrum/prod/gn",
  [CHAIN.SONIC]:
    "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-sonic/prod/gn",
  // [CHAIN.BASE]:
  //   "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-base/prod/gn",
  // [CHAIN.BLAST]:
  //   "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-blast/prod/gn",
  // [CHAIN.MANTLE]:
  //   "https://api.0xgraph.xyz/api/public/e2146f32-5728-4755-b1d1-84d17708c119/subgraphs/clamm-mantle/prod/gn",
};

const clammStartTimes: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1699794000,
  [CHAIN.SONIC]: 1735383288,
  [CHAIN.BASE]: 1714733688,
  [CHAIN.BLAST]: 1714733688,
  [CHAIN.MANTLE]: 1706957688,
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(clammEndpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (timestamp: string) =>
          await getChainStats({ graphUrl: clammEndpoints[chain], timestamp }),
        start: clammStartTimes[chain],
      },
    };
  }, {}),
};

export default adapter;
