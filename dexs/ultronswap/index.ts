import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.ULTRON]: "https://graph-node.ultron-dev.net/subgraphs/name/root/ultronswap-exchange"
}, {});
adapters.adapter.ultron.start = 1659323793;
export default adapters;
