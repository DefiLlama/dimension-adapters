import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('5PoznNdqBAVSxsGv7MQMrVabVrYBbLobrFpWEnNcC6Xw')
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: { fetch },
  },
}

export default adapter;