import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('63auEwyBju1rZWUNZ32k2qwrBQZSEU4XetvKh3ZCwHLA')
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "swapFactories",
  dayData: "swapDayData"
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1633046917,
}

export default adapter;
