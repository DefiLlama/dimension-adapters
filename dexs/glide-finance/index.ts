import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ELASTOS]: "https://api.glidefinance.io/subgraphs/name/glide/exchange"
}, {
  factoriesName: "glideFactories",
  dayData: "glideDayData"
});
adapters.adapter.elastos.start = 1635479215;
export default adapters;
