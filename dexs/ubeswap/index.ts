import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CELO]: "https://api.thegraph.com/subgraphs/name/ubeswap/ubeswap"
}, {
  factoriesName: "ubeswapFactories",
  dayData: "ubeswapDayData",
});
adapters.adapter.celo.start = 1614574153;

export default adapters;
