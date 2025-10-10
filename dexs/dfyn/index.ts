import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

// Not complete! Missing older versions
const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('Dizc6HBJZWB276wcyycYMxN8FMKeKb7RpSvwu83F4gTc'),
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
}

export default adapter;