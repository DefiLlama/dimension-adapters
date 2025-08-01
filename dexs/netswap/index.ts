import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.METIS]: "https://andromeda.thegraph.metis.io/subgraphs/name/netswap/exchange"
  },
  factoriesName: "netswapFactories",
  dayData: "netswapDayData"
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.METIS],
  start: 1638760703,
}

export default adapter;
