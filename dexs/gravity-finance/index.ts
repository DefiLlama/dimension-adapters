
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/agelesszeal/gravity-analytics",
}, {
});

adapters.adapter.polygon.start = 1629419058;
export default adapters;
