import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CeXrZ218JFm5S7iD6sGusqSSQgyFM6wuYoUk7iVygq1c'),
};
const adapter = univ2Adapter(endpoints, {});
adapter.adapter.bsc.start = 1626677527;

export default adapter
