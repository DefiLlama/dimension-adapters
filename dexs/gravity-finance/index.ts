import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('82hBGNdZXvp3JbJbHvRptFanP4q5RszxYWndRact8qzD'),
}, {
});

adapters.adapter.polygon.start = 1629419058;
export default adapters;
