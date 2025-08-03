import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('A1pnYfdxjPz6WMTRtmhyFKYDvwSuAyAdckwsUVWvgd6F')
};

const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1652932015,
}

export default adapter; 