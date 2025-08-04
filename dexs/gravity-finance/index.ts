import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('82hBGNdZXvp3JbJbHvRptFanP4q5RszxYWndRact8qzD'),
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: { fetch, start: 1629419058 },
  },
}

export default adapter;
