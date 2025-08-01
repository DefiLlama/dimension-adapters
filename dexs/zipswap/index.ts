import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('5tAUjmnM9iE4aADZwKhk3fobY8fMFbb1VMsrSKvo4kFr')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.OPTIMISM],
}

export default adapter;