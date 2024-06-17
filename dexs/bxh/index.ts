import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('HvbSoSSDp99Pe9U7gjDhmXUzTbAKTcj77SnV3XKLVChn'),
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('9vZWBdQwCE7oi29YzBrQND5BLnS2iqPhosdG8jr6Rp9R'),
  // [CHAIN.AVAX]: sdk.graph.modifyEndpoint('6dJhWGdrAgYXzky2EFFYw8GZsmZbrwdPMTq69CEqJEFD'), not current daily volume
}, {});

adapters.adapter.bsc.start = 1627172051;
adapters.adapter.ethereum.start = 1629764051;
export default adapters;
