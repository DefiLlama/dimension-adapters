import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.ELASTOS]: "https://api.glidefinance.io/subgraphs/name/glide/exchange"
  },
  factoriesName: "glideFactories",
  dayData: "glideDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ELASTOS]: { fetch, start: 1635479215 },
  },
}

export default adapter;
