import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/glyph/glyph-tvl"
}, {
  factoriesName: "glyphFactories",
  dayData: "glyphDayData"
});
adapters.adapter.core.start = 1710806400;
export default adapters;
