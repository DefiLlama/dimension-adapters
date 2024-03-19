import { BreakdownAdapter } from "../../adapters/types";
import { getChainStats } from "./clamm";
import { CHAIN } from "../../helpers/chains";

const clammEndpoints: { [chain: string]: string } = {
  [CHAIN.ARBITRUM]:
    "https://api.0xgraph.xyz/subgraphs/name/dopex-v2-clamm-public",
};

const clammStartTimes: { [chain: string]: number } = {
  [CHAIN.ARBITRUM]: 1699794000,
};

const adapter: BreakdownAdapter = {
  breakdown: {
    clamm: Object.keys(clammEndpoints).reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch: async (timestamp: string) =>
            await getChainStats({ graphUrl: clammEndpoints[chain], timestamp }),
          start: clammStartTimes[chain],
        },
      };
    }, {}),
  },
};

export default adapter;
