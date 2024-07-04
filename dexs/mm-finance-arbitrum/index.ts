import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('7DHMSRfftzCDjRVYSGTt65PagbTF61ACg4XUCP7JQKJG'),
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapter.adapter.arbitrum.start = 1680134400;

export default adapter
