// https://subgraph.candyswap.exchange/subgraphs/name/exchange
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.MEER]: "https://subgraph.candyswap.exchange/subgraphs/name/exchange",
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1662940800,
}

export default adapter;
