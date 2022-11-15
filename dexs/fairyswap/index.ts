import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FINDORA]: "https://graph.fairyswap.finance/subgraphs/name/findora/fairy"
}, {
  factoriesName: "fairyFactories",
  dayData: "fairyDayData",
});

adapters.adapter.findora.start = async () => 1647684000;
export default adapters;
