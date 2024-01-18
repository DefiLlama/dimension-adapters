import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/60365/zksync-zkswap/v0.0.5"
}, {
});
adapters.adapter[CHAIN.ERA].start = async () => 1700524800;
export default adapters;
