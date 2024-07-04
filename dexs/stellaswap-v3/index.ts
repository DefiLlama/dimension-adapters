import * as sdk from "@defillama/sdk";
// https://api.thegraph.com/subgraphs/name/stellaswap/pulsar
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.MOONBEAN]: sdk.graph.modifyEndpoint('85R1ZetugVABa7BiqKFqE2MewRuJ8b2SaLHffyTHDAht')
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});
adapters.adapter.moonbeam.start = 1672876800;
export default adapters;
