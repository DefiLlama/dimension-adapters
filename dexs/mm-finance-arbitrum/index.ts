import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7DHMSRfftzCDjRVYSGTt65PagbTF61ACg4XUCP7JQKJG'),
};

const fetch = univ2Adapter({
  endpoints,
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: 1680134400,
}

export default adapter;
