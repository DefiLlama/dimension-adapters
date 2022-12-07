import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.XDC]: "https://graph-node.yodaplus.net:8000/subgraphs/name/pro100skm/factory"
}, {});

adapters.adapter.xdc.start = async () => 1647993600;
export default adapters;
