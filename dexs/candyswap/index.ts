// https://subgraph.candyswap.exchange/subgraphs/name/exchange
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MEER]: "https://subgraph.candyswap.exchange/subgraphs/name/exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapter.adapter.meer.start = 1662940800;

export default adapter
