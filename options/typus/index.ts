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
        start: 1697700660,
        customBackfill: async (ts: string) =>
          await getChainData(ts, "1697700660"),
      },
    };
  }, {}),
};

export default adapter;
