import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('2MF3GHhPgvCk8ZHBso8uxTkcT97zjmoEPfxkbeH4D7Jb'),
};
const adapter = univ2Adapter(endpoints, {});

adapter.adapter.bsc.start = 1631404800;

export default adapter
