import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CfeVCTevsVCZrmsrYEcpVzPYgxGmMihASYirpWP7r228')
};

const fetch = univ2Adapter({
  endpoints,
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1622518288,
}

export default adapter;
