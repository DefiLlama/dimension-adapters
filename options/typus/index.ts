import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, ChainEndpoints } from "../../adapters/types";
import getChainData from "./getChainData";

const endpoints: ChainEndpoints = {
  [CHAIN.SUI]:
    "https://us-central1-aqueous-freedom-378103.cloudfunctions.net/mongodb",
};

const adapter: SimpleAdapter = {
  adapter: Object.keys(endpoints).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: async (ts: string) => await getChainData(ts),
        start: async () => 1677918120,
      },
    };
  }, {}),
};

export default adapter;
