import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('9xwmkrJTk5s5e8QoBnQG1yTN8seLwzLWwACaqTgq2U9x')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.POLYGON],
}

export default adapter;