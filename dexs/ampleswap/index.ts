import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('2MF3GHhPgvCk8ZHBso8uxTkcT97zjmoEPfxkbeH4D7Jb'),
};
const fetch = univ2Adapter({
  endpoints,
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: Object.keys(endpoints),
  start: 1631404800,
}

export default adapter
