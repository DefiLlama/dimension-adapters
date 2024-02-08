import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/dystopia-exchange/dystopia"
}, {});
adapters.adapter.polygon.start = 1652932015;
export default adapters;
