import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.AVAX]: sdk.graph.modifyEndpoint('An3x5Mz4YXEERomXYC4AhGgNhRthPFXNYDnrMCjrAJe')
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "canaryFactories",
  dayData: "canaryDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
}

export default adapter;