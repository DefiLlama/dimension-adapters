import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CeXrZ218JFm5S7iD6sGusqSSQgyFM6wuYoUk7iVygq1c'),
};

const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1626677527
}

export default adapter;