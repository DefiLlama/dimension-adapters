import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: " https://api.thegraph.com/subgraphs/name/1hive/honeyswap-polygon",
    [CHAIN.XDAI]: "https://api.thegraph.com/subgraphs/name/1hive/honeyswap-xdai"
  },
    factoriesName: "honeyswapFactories",
    dayData: "honeyswapDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: { fetch, start: 1622173831 },
    [CHAIN.XDAI]: { fetch, start: 1599191431 },
  },
}

export default adapter;
