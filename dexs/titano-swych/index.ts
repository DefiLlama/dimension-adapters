
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/swychfinance/exchange"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});
adapters.adapter.bsc.start = 1648005393;
export default adapters;
