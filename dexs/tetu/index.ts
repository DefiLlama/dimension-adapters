import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/tetu-io/tetu-swap"
}, {
});

adapters.adapter.polygon.start = 1634863038;
export default adapters;
