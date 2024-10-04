import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('G2tXDm6mgqBMuC7hq9GRVeTv5SRBAVnPFGcpGBab2cea')
}, {
  factoriesName: "factories",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.arbitrum.start = 1685574000;
export default adapters;
