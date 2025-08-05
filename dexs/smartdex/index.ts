import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('8Lw1rRcKYgi4qfdLuk4gRubLVR48RpGuBCJiB7hLtupt')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.POLYGON],
}

export default adapter;