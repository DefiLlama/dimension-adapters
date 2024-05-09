import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/privatelabs-chainx/bxhbnb",
  [CHAIN.ETHEREUM]: "https://api.thegraph.com/subgraphs/name/privatelabs-chainx/bxheth",
  // [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/privatelabs-chainx/bxhavax", not current daily volume
}, {});

adapters.adapter.bsc.start = 1627172051;
adapters.adapter.ethereum.start = 1629764051;
export default adapters;
