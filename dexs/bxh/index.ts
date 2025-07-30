import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('HvbSoSSDp99Pe9U7gjDhmXUzTbAKTcj77SnV3XKLVChn'),
    [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('9vZWBdQwCE7oi29YzBrQND5BLnS2iqPhosdG8jr6Rp9R'),
    // [CHAIN.AVAX]: sdk.graph.modifyEndpoint('6dJhWGdrAgYXzky2EFFYw8GZsmZbrwdPMTq69CEqJEFD'), not current daily volume
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: { fetch, start: 1627172051 },
    [CHAIN.ETHEREUM]: { fetch, start: 1629764051 },
  },
}

export default adapter;
