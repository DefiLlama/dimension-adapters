import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('CwTzDabgebYMipjh9gqP4Kyrbi3HGQSabBuR4ngorXUt')
  },
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BSC],
}

export default adapter;