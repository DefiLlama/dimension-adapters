import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: "https://api.thegraph.com/subgraphs/name/spearminttechnolgies/alien-exchange-test",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapter.adapter.arbitrum.start = 1676505600;

export default adapter
