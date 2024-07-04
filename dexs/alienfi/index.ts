import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('E6A4mHKkMhiNeoiwDU8PME7btMt6xGGSHAZR6ccJsLJe'),
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

adapter.adapter.arbitrum.start = 1676505600;

export default adapter
