import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const adapter = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/alita-finance/exchangev2"
}, {});

adapter.adapter.bsc.start = async () => 1629947542;
export default adapter;
