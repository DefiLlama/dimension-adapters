import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.XDC]: "https://analytics.xspswap.finance/subgraphs/name/some/factory"
}, {});

adapters.adapter.xdc.start = async () => 1647993600;
export default adapters;
