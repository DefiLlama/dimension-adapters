import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('E6A4mHKkMhiNeoiwDU8PME7btMt6xGGSHAZR6ccJsLJe'),
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
  start: 1676505600,
}

export default adapter;
